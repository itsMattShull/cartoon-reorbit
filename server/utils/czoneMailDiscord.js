// server/utils/czoneMailDiscord.js
//
// Discord delivery for cZone Mail. Every function here is called ONLY from the
// czone-mail-notify BullMQ worker (single fork-mode instance), never from a
// request handler:
//
//   * server/prisma.js exits the process on SIGINT/SIGTERM as soon as
//     $disconnect() resolves, so un-awaited work in a request dies on every
//     deploy and on the nightly droplet reboot;
//   * thread creation all keys on one parent-channel rate-limit bucket, so it
//     has to be serialized somewhere, and one worker gives that for free.
//
// Threads are PRIVATE (type 12). A public thread per recipient would publish, to
// every guild member, a permanent browsable list of which children receive mail
// and from whom — a materially worse privacy posture than the DMs this app
// already sends, and these are minors.

import {
  normalizeBotAuthHeader,
  sendDiscordDMByDiscordId
} from '../utils/discord.js'
import { truncateForDiscord } from '../utils/czoneMailRules.js'

const DISCORD_API_BASE = 'https://discord.com/api/v10'

// Discord thread types. `type` is sent explicitly on every create: the API still
// defaults to PRIVATE_THREAD for backwards compatibility and documents that this
// default will be removed, so relying on it is a latent break.
export const THREAD_TYPE_PUBLIC  = 11
export const THREAD_TYPE_PRIVATE = 12

// Must be one of 60 / 1440 / 4320 / 10080 — anything else is a 400. One day keeps
// idle threads out of the guild's active-thread set, which is a capped resource.
const AUTO_ARCHIVE_MINUTES = 1440

// Discord JSON error codes we branch on.
const ERR_UNKNOWN_CHANNEL     = 10003 // thread (or parent) deleted
const ERR_ARCHIVED_THREAD     = 50083 // op not allowed on an archived thread
const ERR_MISSING_ACCESS      = 50001
const ERR_MISSING_PERMISSIONS = 50013
const ERR_THREAD_LOCKED       = 160005
const ERR_MAX_ACTIVE_THREADS  = 160006

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** Permission/config failures that must never be retried and never recreate a thread. */
function isFatalConfigError(code) {
  return code === ERR_MISSING_ACCESS ||
         code === ERR_MISSING_PERMISSIONS ||
         code === ERR_THREAD_LOCKED ||
         code === ERR_MAX_ACTIVE_THREADS
}

/**
 * One Discord REST call, returning a structured result instead of throwing.
 * Retries only on 429, honouring retry_after, up to `attempts` times.
 *
 * Returns { ok, status, code, data, error }.
 */
async function discordRequest(path, { method = 'GET', body = null, attempts = 3 } = {}) {
  const authHeader = normalizeBotAuthHeader(process.env.BOT_TOKEN)
  if (!authHeader) return { ok: false, status: 0, code: null, error: 'missing BOT_TOKEN' }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let res
    try {
      res = await fetch(`${DISCORD_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000)
      })
    } catch (err) {
      return { ok: false, status: 0, code: null, error: err?.message || String(err) }
    }

    if (res.status === 429) {
      let payload = {}
      try { payload = await res.json() } catch {}
      // A global 429 means the whole bot is over budget, not just this route.
      const waitMs = Math.ceil(((payload.retry_after ?? 5) * 1000))
      await sleep(Math.min(waitMs, 30_000))
      continue
    }

    if (res.status === 204) return { ok: true, status: 204, code: null, data: null }

    let data = null
    try { data = await res.json() } catch {}

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        code: data?.code ?? null,
        error: data?.message || `HTTP ${res.status}`
      }
    }
    return { ok: true, status: res.status, code: null, data }
  }

  return { ok: false, status: 429, code: null, error: 'rate limited' }
}

/**
 * Verify a channel id is a plain guild text channel (type 0). Private threads can
 * only be created under one; a forum/media channel uses an entirely different
 * endpoint that requires a starter message, and would 400 forever otherwise.
 *
 * Used by the admin settings route so a misconfiguration is caught at save time
 * rather than silently breaking notifications.
 */
export async function verifyMailChannel(channelId) {
  const id = String(channelId || '').trim()
  if (!id) return { ok: false, error: 'No channel ID provided.' }
  if (!/^\d{17,20}$/.test(id)) return { ok: false, error: 'Channel ID must be a numeric Discord ID.' }

  const res = await discordRequest(`/channels/${id}`)
  if (!res.ok) {
    if (res.code === ERR_UNKNOWN_CHANNEL) return { ok: false, error: 'No channel with that ID is visible to the bot.' }
    if (isFatalConfigError(res.code)) return { ok: false, error: 'The bot cannot access that channel. Check its permissions.' }
    return { ok: false, error: `Could not verify the channel (${res.error}).` }
  }
  if (res.data?.type !== 0) {
    return { ok: false, error: 'That channel must be a standard text channel (not a forum, voice, or category).' }
  }
  if (res.data?.nsfw) {
    // Threads inherit NSFW from the parent, which locks out 13-17 accounts.
    return { ok: false, error: 'That channel is age-restricted, so younger players could not see their mail thread.' }
  }
  return { ok: true, name: res.data?.name || null }
}

async function createMailThread(channelId, username) {
  const name = `cMail — ${String(username || 'player').slice(0, 80)}`
  return await discordRequest(`/channels/${channelId}/threads`, {
    method: 'POST',
    body: {
      name,
      type: THREAD_TYPE_PRIVATE,
      auto_archive_duration: AUTO_ARCHIVE_MINUTES,
      // Stops non-moderators pulling other players into someone else's mail thread.
      invitable: false,
      // The thread is a notification feed, not a side-channel for unmoderated
      // free-text chat between minors outside the canned-message model.
      rate_limit_per_user: 21600
    }
  })
}

/**
 * Resolve the reusable notification thread for one recipient, creating it if
 * needed. `CZoneMailThread` is treated as a cache: Discord can delete a thread at
 * any time, so a 10003 clears the row and recreates once.
 *
 * Returns { threadId, memberAdded } or null when threads are unavailable (the
 * caller then falls back to a DM).
 */
async function ensureMailThread(prisma, { userId, username, channelId }) {
  const existing = await prisma.cZoneMailThread.findUnique({ where: { userId } })

  // A stored thread under a different parent channel is stale — the admin
  // repointed czoneMailDiscordChannelId.
  if (existing && existing.channelId === channelId) {
    return { threadId: existing.threadId, memberAdded: !!existing.memberAddedAt, created: false }
  }

  const created = await createMailThread(channelId, username)
  if (!created.ok || !created.data?.id) {
    return { threadId: null, fatal: isFatalConfigError(created.code), error: created.error }
  }

  const threadId = created.data.id
  await prisma.cZoneMailThread.upsert({
    where: { userId },
    create: { userId, threadId, channelId },
    update: { threadId, channelId, memberAddedAt: null, lastPostedAt: null }
  })
  return { threadId, memberAdded: false, created: true }
}

/**
 * Add the recipient to their private thread. Idempotent on Discord's side (204
 * whether or not they were already a member), so this is only called once per
 * thread and re-run if a post later fails.
 */
async function addThreadMember(prisma, { userId, threadId, discordId }) {
  const res = await discordRequest(`/channels/${threadId}/thread-members/${discordId}`, { method: 'PUT' })
  if (res.ok) {
    await prisma.cZoneMailThread.updateMany({
      where: { userId, threadId },
      data: { memberAddedAt: new Date() }
    })
    return { ok: true }
  }
  return { ok: false, code: res.code, error: res.error }
}

async function postToThread(threadId, content, mentionUserIds) {
  return await discordRequest(`/channels/${threadId}/messages`, {
    method: 'POST',
    body: {
      content,
      // parse: [] means ONLY the ids in `users` can ping — nothing in the message
      // text can trigger an @everyone/@here/role mention.
      allowed_mentions: { parse: [], users: mentionUserIds }
    }
  })
}

function siteBaseUrl() {
  return process.env.NODE_ENV === 'production'
    ? 'https://www.cartoonreorbit.com'
    : 'http://localhost:3000'
}

/**
 * Build the notification body. Senders are named because the thread is private to
 * the recipient; bodies are already admin-authored and sanitized upstream.
 */
export function buildNotificationContent({ discordId, items }) {
  const mention = discordId ? `<@${discordId}> ` : ''
  const count = items.length
  const lines = []

  if (count === 1) {
    const it = items[0]
    lines.push(`${mention}📬 **${it.senderUsername}** left you cMail on your cZone:`)
    lines.push(`> ${it.emoji ? `${it.emoji} ` : ''}${it.body}`)
  } else {
    lines.push(`${mention}📬 You have **${count} new cMail** on your cZone:`)
    for (const it of items.slice(0, 10)) {
      lines.push(`> **${it.senderUsername}** — ${it.emoji ? `${it.emoji} ` : ''}${it.body}`)
    }
    if (count > 10) lines.push(`> …and ${count - 10} more.`)
  }

  lines.push('')
  lines.push(`Read them in My cWorld → cMail: ${siteBaseUrl()}/newsite/MycWorld`)
  return truncateForDiscord(lines.join('\n'))
}

/**
 * Deliver one batch of cMail notifications to a single recipient.
 *
 * Never throws: the messages are already saved and visible on the site, so a
 * Discord outage must not fail the job in a way that loses them. Returns a
 * result object the worker logs.
 */
export async function deliverCzoneMailNotification(prisma, { recipientId, items, channelId }) {
  if (!recipientId || !Array.isArray(items) || items.length === 0) {
    return { delivered: false, via: null, reason: 'nothing to deliver' }
  }

  const user = await prisma.user.findUnique({
    where: { id: recipientId },
    select: {
      discordId: true,
      username: true,
      inGuild: true,
      allowCzoneMailNotifications: true,
      banned: true,
      active: true
    }
  })

  if (!user) return { delivered: false, via: null, reason: 'recipient missing' }
  if (!user.allowCzoneMailNotifications) return { delivered: false, via: null, reason: 'opted out' }
  if (!user.discordId) return { delivered: false, via: null, reason: 'no discord account linked' }
  if (user.banned || user.active === false) return { delivered: false, via: null, reason: 'inactive account' }

  const content = buildNotificationContent({ discordId: user.discordId, items })

  // A thread is only reachable by someone who is actually in the guild — the
  // parent channel's VIEW_CHANNEL gate applies even to a directly-added member.
  const canUseThread = !!channelId && user.inGuild !== false

  if (canUseThread) {
    const result = await deliverViaThread(prisma, { user, recipientId, channelId, content })
    if (result.delivered) return result
    // Fall through to DM on any thread failure.
  }

  const dmOk = await sendDiscordDMByDiscordId(user.discordId, content)
  return dmOk
    ? { delivered: true, via: 'dm' }
    : { delivered: false, via: null, reason: 'thread and DM both failed' }
}

async function deliverViaThread(prisma, { user, recipientId, channelId, content }) {
  let thread = await ensureMailThread(prisma, {
    userId: recipientId,
    username: user.username,
    channelId
  })
  if (!thread?.threadId) return { delivered: false, reason: thread?.error || 'thread unavailable' }

  // On a freshly created thread, add the member before posting: a private thread
  // is invisible to a non-member, so the ping would reach nobody. On an existing
  // thread, post first — posting auto-unarchives, whereas adding a member to an
  // archived thread fails with 50083.
  if (thread.created && !thread.memberAdded) {
    await addThreadMember(prisma, { userId: recipientId, threadId: thread.threadId, discordId: user.discordId })
  }

  let post = await postToThread(thread.threadId, content, [user.discordId])

  // The stored thread was deleted on Discord's side — drop the cached row and
  // rebuild it once. Anything else (permissions, locked, guild thread cap) must
  // NOT recreate, or a misconfiguration would spawn threads without limit.
  if (!post.ok && post.code === ERR_UNKNOWN_CHANNEL) {
    await prisma.cZoneMailThread.deleteMany({ where: { userId: recipientId } })
    thread = await ensureMailThread(prisma, { userId: recipientId, username: user.username, channelId })
    if (!thread?.threadId) return { delivered: false, reason: 'thread recreate failed' }
    await addThreadMember(prisma, { userId: recipientId, threadId: thread.threadId, discordId: user.discordId })
    post = await postToThread(thread.threadId, content, [user.discordId])
  } else if (!post.ok && post.code === ERR_ARCHIVED_THREAD) {
    // Posting normally unarchives on its own; if it didn't, unarchive explicitly.
    // The bot owns the thread, so this needs no MANAGE_THREADS.
    await discordRequest(`/channels/${thread.threadId}`, { method: 'PATCH', body: { archived: false } })
    post = await postToThread(thread.threadId, content, [user.discordId])
  }

  if (!post.ok) {
    return { delivered: false, reason: `thread post failed: ${post.error}`, code: post.code }
  }

  // Late member-add for reused threads, after the post has unarchived the thread.
  if (!thread.created && !thread.memberAdded) {
    await addThreadMember(prisma, { userId: recipientId, threadId: thread.threadId, discordId: user.discordId })
  }

  await prisma.cZoneMailThread.updateMany({
    where: { userId: recipientId },
    data: { lastPostedAt: new Date() }
  })
  return { delivered: true, via: 'thread' }
}
