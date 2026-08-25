// server/utils/discord.js
export function auctionLink(auctionId) {
  // Keep this identical to your other DM base URL logic
  const isProd = process.env.NODE_ENV === 'production'
  return isProd
    ? `https://www.cartoonreorbit.com/newsite/AuctionHouse/${auctionId}`
    : `http://localhost:3000/newsite/AuctionHouse/${auctionId}`
}

function getAnnouncementsBotToken() {
  return process.env.DISCORD_ANNOUNCEMENTS_BOT_TOKEN || process.env.BOT_TOKEN
}

const DISCORD_API_BASE = 'https://discord.com/api/v10'

function getBotAuthHeader() {
  const token = process.env.BOT_TOKEN
  if (!token) return null
  return token.startsWith('Bot ') ? token : `Bot ${token}`
}

function normalizeRoleName(name) {
  return typeof name === 'string' ? name.trim() : ''
}

async function fetchGuildRoles() {
  const authHeader = getBotAuthHeader()
  const guildId = process.env.DISCORD_GUILD_ID
  if (!authHeader || !guildId) return []
  try {
    const res = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/roles`, {
      headers: { Authorization: authHeader }
    })
    if (!res.ok) return []
    const roles = await res.json()
    return Array.isArray(roles) ? roles : []
  } catch {
    return []
  }
}

async function createGuildRole(roleName) {
  const authHeader = getBotAuthHeader()
  const guildId = process.env.DISCORD_GUILD_ID
  if (!authHeader || !guildId) return null
  try {
    const res = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/roles`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: roleName,
        permissions: '0',
        mentionable: false,
        hoist: false
      })
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function ensureGuildRoleByName(roleName) {
  const name = normalizeRoleName(roleName)
  if (!name) return null
  const roles = await fetchGuildRoles()
  const existing = roles.find(r => normalizeRoleName(r?.name) === name)
  if (existing?.id) return existing
  return await createGuildRole(name)
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function addRoleToMember(discordUserId, roleId) {
  const authHeader = getBotAuthHeader()
  const guildId = process.env.DISCORD_GUILD_ID
  if (!discordUserId || !roleId || !authHeader || !guildId) return false

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
      { method: 'PUT', headers: { Authorization: authHeader } }
    )
    if (res.status === 204) return true
    if (res.status === 429) {
      let body = { retry_after: 5 }
      try { body = await res.json() } catch {}
      await sleep(Math.ceil((body.retry_after || 5) * 1000))
      continue
    }
    return false
  }
  return false
}

// Shared PUT/DELETE-a-guild-member-role primitive backing the two exported functions below.
// Every other role sync in this codebase (addRoleToMember above, the cMoon/verified-role cron
// jobs in server/cron/sync-guild-members.js) is grant-only by deliberate design. These two are
// the first calls in the app that can also REVOKE a Discord role — used only for real-time cMoon
// membership sync (see reassignUserCMoon in server/utils/cmoon.js), never from a bulk/cron path.
async function putOrDeleteMemberRole(method, discordUserId, roleId) {
  const authHeader = getBotAuthHeader()
  const guildId = process.env.DISCORD_GUILD_ID
  if (!discordUserId || !roleId || !authHeader || !guildId) return false

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
      { method, headers: { Authorization: authHeader } }
    )
    // A DELETE for a role the member never had (or no longer has) also comes back 204 — treated
    // as success either way, since the end state ("member doesn't have this role") is what matters.
    if (res.status === 204) return true
    if (res.status === 429) {
      let body = { retry_after: 5 }
      try { body = await res.json() } catch {}
      await sleep(Math.ceil((body.retry_after || 5) * 1000))
      continue
    }
    return false
  }
  return false
}

export async function grantGuildRole(discordUserId, roleId) {
  return putOrDeleteMemberRole('PUT', discordUserId, roleId)
}

export async function revokeGuildRole(discordUserId, roleId) {
  return putOrDeleteMemberRole('DELETE', discordUserId, roleId)
}

async function openDmChannel(discordId) {
  const BOT_TOKEN = process.env.BOT_TOKEN
  if (!BOT_TOKEN || !discordId) return null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`${DISCORD_API_BASE}/users/@me/channels`, {
        method: 'POST',
        headers: { Authorization: `${BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: discordId })
      })
      if (res.status === 429) {
        let body = { retry_after: 5 }
        try { body = await res.json() } catch {}
        const waitMs = Math.ceil((body.retry_after || 5) * 1000)
        await sleep(waitMs)
        continue
      }
      if (!res.ok) {
        return null
      }
      const dmChannel = await res.json()
      return dmChannel?.id || null
    } catch (err) {
      return null
    }
  }

  return null
}

export async function sendDiscordDMByDiscordId(discordId, content) {
  const BOT_TOKEN = process.env.BOT_TOKEN
  if (!BOT_TOKEN || !discordId) return false

  const channelId = await openDmChannel(discordId)
  if (!channelId) return false

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { Authorization: `${BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      })
      if (res.status === 429) {
        let body = { retry_after: 5 }
        try { body = await res.json() } catch {}
        const waitMs = Math.ceil((body.retry_after || 5) * 1000)
        await sleep(waitMs)
        continue
      }
      if (!res.ok) {
        return false
      }
      return true
    } catch (err) {
      return false
    }
  }

  return false
}

export async function assignDiscordRoleByName(prisma, userId, roleName) {
  const name = normalizeRoleName(roleName)
  if (!name) return null
  if (!userId) return null

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { discordId: true, inGuild: true }
  })
  if (!user?.discordId) return null
  if (user.inGuild === false) return null

  const role = await ensureGuildRoleByName(name)
  if (!role?.id) return null

  const ok = await addRoleToMember(user.discordId, role.id)
  return ok ? role.name : null
}

/**
 * Fetches the user’s discordId and sends an “outbid” message.
 * Non-throwing: failures are swallowed.
 */
export async function notifyOutbidByUserId(prisma, userId, auctionId) {
  if (!userId) return
  try {

    // Skip if user is the current leader
    const aucHead = await prisma.auction.findUnique({
      where: { id: String(auctionId) },
      select: { highestBidderId: true }
    })
    if (aucHead?.highestBidderId === userId) return

    // Skip if user never bid on this auction
    const hasBid = await prisma.bid.findFirst({
      where: { auctionId: String(auctionId), userId },
      select: { id: true }
    })
    if (!hasBid) return

    // 1) Who to DM
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { discordId: true, allowAuctionNotifications: true, username: true }
    })
    if (!u?.discordId) return
    if (!u.allowAuctionNotifications) return
    // Skip system/official account
    if (u.username === 'CartoonReOrbitOfficial') return

    // 2) Load auction + cToon details
    const auc = await prisma.auction.findUnique({
      where: { id: String(auctionId) },
      select: {
        id: true,
        highestBid: true,
        userCtoon: {
          select: {
            mintNumber: true,
            ctoon: { select: { name: true, isSecondEdition: true } }
          }
        }
      }
    })
    const ctoonName = auc?.userCtoon?.ctoon?.name || 'cToon'
    const isSecondEdition = !!auc?.userCtoon?.ctoon?.isSecondEdition
    const mintNumber = auc?.userCtoon?.mintNumber ?? null
    const highestBid = auc?.highestBid ?? 0

    // 3) Compose message
    const link = auctionLink(String(auctionId))
    const lines = [
      `⚠️ You’ve been outbid on an auction.`,
      `• Item: ${ctoonName}${isSecondEdition ? ' (Second Edition)' : ''}${mintNumber != null ? ` (Mint #${mintNumber})` : ''}`,
      `• Current highest bid: ${highestBid} pts`,
      ``,
      `View the auction: ${link}`
    ]

    await sendDiscordDMByDiscordId(u.discordId, lines.join('\n'))
  } catch {
    // ignore failures
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Guild channel helpers

async function fetchGuildChannels() {
  const BOT_TOKEN = process.env.BOT_TOKEN
  const GUILD_ID = process.env.DISCORD_GUILD_ID
  if (!BOT_TOKEN || !GUILD_ID) return []
  try {
    const channels = await $fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, {
      method: 'GET',
      headers: { 'Authorization': BOT_TOKEN }
    })
    return Array.isArray(channels) ? channels : []
  } catch {
    return []
  }
}

async function findTextChannelIdByName(name) {
  const target = String(name || '').trim().toLowerCase()
  if (!target) return null
  const channels = await fetchGuildChannels()
  const ch = channels.find(ch => ch?.type === 0 && String(ch?.name || '').toLowerCase() === target)
  // console.log('findTextChannelIdByName:', name, '->', ch?.id || 'not found')
  return ch?.id || null
}

export async function sendGuildChannelMessageByName(channelName, content) {
  const BOT_TOKEN = process.env.BOT_TOKEN
  if (!BOT_TOKEN) return false
  try {
    const channelId = await findTextChannelIdByName(channelName)
    if (!channelId) return false
    await $fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': BOT_TOKEN,
        'Content-Type': 'application/json'
      },
      body: { content }
    })
    // console.log('sendGuildChannelMessageByName succeeded')
    return true
  } catch {
    // console.log('sendGuildChannelMessageByName failed')
    return false
  }
}

// New: Send to a channel by its ID (no lookup by name)
// mentionUserIds: allowlist of Discord user IDs permitted to be pinged by this message.
// Everything else (content text, @everyone/@here, roles, other users) is blocked at the
// API level via allowed_mentions, so message content built from user-controlled strings
// (usernames, contest/item names, etc.) can never trigger an unintended mass-ping.
export async function sendGuildChannelMessageById(channelId, content, tokenOverride = null, mentionUserIds = [], embeds = []) {
  const rawToken = tokenOverride || process.env.BOT_TOKEN
  if (!rawToken || !channelId) return false
  const authHeader = rawToken.startsWith('Bot ') ? rawToken : `Bot ${rawToken}`

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content,
          allowed_mentions: { parse: [], users: mentionUserIds },
          ...(embeds.length ? { embeds } : {})
        }),
        signal: AbortSignal.timeout(8000)
      })
      if (res.status === 429 && attempt === 0) {
        let body = { retry_after: 2 }
        try { body = await res.json() } catch {}
        await sleep(Math.min(Math.ceil((body.retry_after || 2) * 1000), 5000))
        continue
      }
      if (!res.ok) {
        console.error('sendGuildChannelMessageById failed:', res.status, await res.text().catch(() => ''))
        return false
      }
      return true
    } catch (e) {
      console.error('sendGuildChannelMessageById failed:', e?.message || e)
      return false
    }
  }
  return false
}

function formatList(items) {
  if (!items.length) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

export async function announceAchievement(prisma, userId, achievementTitle, rewardSummary = null, roleName = null) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { discordId: true, username: true, inGuild: true } })
    if (!user?.discordId || user.inGuild === false) return
    const config = await prisma.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { achievementDiscordChannelId: true }
    })
    const channelId = (config?.achievementDiscordChannelId || '').trim() || process.env.DISCORD_ANNOUNCEMENTS_CHANNEL
    const botToken = getAnnouncementsBotToken()
    if (!channelId || !botToken) return
    const tag = `<@${user.discordId}>`
    const title = String(achievementTitle || 'an achievement')
    let msg = `🎉 Congrats ${tag}! You unlocked “${title}”.`
    if (rewardSummary) {
      const parts = []
      if (rewardSummary.points && rewardSummary.points > 0) {
        parts.push(`${rewardSummary.points} points`)
      }
      if (Array.isArray(rewardSummary.ctoons)) {
        for (const ctoon of rewardSummary.ctoons) {
          if (!ctoon?.name || !ctoon?.quantity) continue
          parts.push(ctoon.quantity > 1 ? `${ctoon.name} ×${ctoon.quantity}` : ctoon.name)
        }
      }
      if (rewardSummary.backgrounds && rewardSummary.backgrounds > 0) {
        parts.push(
          rewardSummary.backgrounds === 1
            ? '1 background unlocked for your cZones'
            : `${rewardSummary.backgrounds} backgrounds unlocked for your cZones`
        )
      }
      if (parts.length) {
        msg += ` You received ${formatList(parts)}.`
      }
      if (rewardSummary.cMoonRank?.name) {
        msg += ` You've been promoted to **${rewardSummary.cMoonRank.name}** in your cMoon!`
      }
    }
    const trimmedRole = normalizeRoleName(roleName)
    if (trimmedRole) {
      msg += ` You also received the ${trimmedRole} role.`
    }
    await sendGuildChannelMessageById(channelId, msg, botToken, [user.discordId])
  } catch {
    // swallow in worker/cron context
  }
}

function formatPrizeSummary(prizes) {
  if (!prizes) return ''
  const parts = []
  const points = Number(prizes.points || 0)
  if (points > 0) parts.push(`${points} points`)
  if (Array.isArray(prizes.ctoons)) {
    for (const ctoon of prizes.ctoons) {
      if (!ctoon?.name || !ctoon?.quantity) continue
      parts.push(ctoon.quantity > 1 ? `${ctoon.name} ×${ctoon.quantity}` : ctoon.name)
    }
  }
  const backgroundCount = Array.isArray(prizes.backgroundIds) ? prizes.backgroundIds.length : 0
  if (backgroundCount > 0) {
    parts.push(backgroundCount === 1 ? '1 cZone background' : `${backgroundCount} cZone backgrounds`)
  }
  return formatList(parts)
}

// Announce a distributed cZone Contest to the configured Discord channel.
// Never throws — failures are logged only, since prize distribution has already
// succeeded by the time this is called and must not be reported as failed.
export async function announceCZoneContestWinner(prisma, {
  contestName,
  winnerUserId,
  winnerPrizeSummary,
  participantPrizeSummary,
  participantCount = 0,
  winnerImageUrl = null
}) {
  try {
    const [config, winner] = await Promise.all([
      prisma.globalGameConfig.findUnique({
        where: { id: 'singleton' },
        select: { czoneContestDiscordChannelId: true }
      }),
      prisma.user.findUnique({
        where: { id: winnerUserId },
        select: { discordId: true, username: true, inGuild: true }
      })
    ])

    const channelId = (config?.czoneContestDiscordChannelId || '').trim() || process.env.DISCORD_ANNOUNCEMENTS_CHANNEL
    const botToken = getAnnouncementsBotToken()
    if (!channelId || !botToken || !winner) return

    const canPing = !!winner.discordId && winner.inGuild !== false
    const winnerMention = canPing ? `<@${winner.discordId}>` : (winner.username || 'The winner')

    let msg = `🏆 Congrats ${winnerMention}! You won the **${contestName}** cZone Contest!`
    const winnerParts = formatPrizeSummary(winnerPrizeSummary)
    if (winnerParts) msg += `\n🥇 First place prize: ${winnerParts}.`
    const participantParts = formatPrizeSummary(participantPrizeSummary)
    if (participantParts && participantCount > 0) {
      msg += `\n🎁 All ${participantCount} participant${participantCount === 1 ? '' : 's'} received: ${participantParts}.`
    }

    const embeds = []
    if (winnerImageUrl) {
      const isProd = process.env.NODE_ENV === 'production'
      const baseUrl = isProd ? 'https://www.cartoonreorbit.com' : 'http://localhost:3000'
      embeds.push({
        title: String(contestName || 'cZone Contest').slice(0, 256),
        image: { url: encodeURI(`${baseUrl}${winnerImageUrl}`) }
      })
    }

    await sendGuildChannelMessageById(channelId, msg, botToken, canPing ? [winner.discordId] : [], embeds)
  } catch (e) {
    console.error('announceCZoneContestWinner failed:', e?.message || e)
  }
}

// Truncates a string to `max` characters without splitting a UTF-16 surrogate
// pair (which would otherwise corrupt the last character and can make Discord
// reject the payload with a 400).
function truncateSafely(str, max) {
  const chars = [...String(str || '')]
  if (chars.length <= max) return chars.join('')
  return chars.slice(0, max).join('')
}

// Announce a PR opened/merged event to the configured Discord channel.
// `title`/`body` come from the pull request as reported by our own GitHub Actions
// workflow; `url` is always built by the caller from a hardcoded owner/repo + PR
// number rather than trusting a URL out of the webhook payload. Never throws —
// the webhook endpoint decides how to report failure back to the caller.
export async function sendPrNotification(channelId, { number, title, body, url, author, action, branch }) {
  const botToken = getAnnouncementsBotToken()
  if (!channelId || !botToken) return false

  const safeTitle = truncateSafely(title || '(no title)', 256)
  const embed = { title: `PR #${number}: ${safeTitle}`, url, color: action === 'merged' ? 0x57F287 : 0x5865F2 }
  if (author) embed.author = { name: truncateSafely(author, 256) }

  if (action === 'merged') {
    embed.description = `✅ Merged into \`${branch}\`.`
  } else {
    const DESC_LIMIT = 4096
    const rawBody = String(body || '').trim()
    if (rawBody) {
      const suffix = `\n\n[…continued on GitHub](${url})`
      const bodyLimit = DESC_LIMIT - suffix.length
      const truncatedBody = truncateSafely(rawBody, bodyLimit)
      embed.description = truncatedBody.length < rawBody.length ? `${truncatedBody}${suffix}` : truncatedBody
    } else {
      embed.description = '_No description provided._'
    }
  }

  return sendGuildChannelMessageById(channelId, '', botToken, [], [embed])
}
