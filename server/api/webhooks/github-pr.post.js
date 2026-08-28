// server/api/webhooks/github-pr.post.js
//
// Called by .github/workflows/pr-discord-notify.yml (never by GitHub directly) when a
// pull request is opened, or merged, against this deployment's tracked branch (dev on
// the dev deployment, master on prod). Posts a Discord embed to the channel configured
// in Admin > Global Settings > Discord.
import { defineEventHandler, readBody, getRequestHeader, createError, getHeader } from 'h3'
import { createHash, timingSafeEqual } from 'node:crypto'
import { prisma as db } from '@/server/prisma'
import { sendPrNotification } from '@/server/utils/discord'

const REPO_SLUG = process.env.GITHUB_REPO_SLUG || 'itsMattShull/cartoon-reorbit'
const MAX_BODY_BYTES = 64 * 1024
const MIN_SECRET_LENGTH = 32

// Best-effort de-dupe / rate-limit, scoped to this process only. PM2 runs nuxt-server
// in cluster mode, so this does not coordinate across workers — it just cuts down on
// duplicate messages from retried Actions runs hitting the same worker, and caps abuse
// if the shared secret ever leaks. Not a substitute for the secret check below.
const recentEvents = new Map() // `${action}:${prNumber}` -> expiry timestamp (ms)
const DEDUPE_WINDOW_MS = 10 * 60 * 1000
let requestTimestamps = []
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX = 30

function sha256(value) {
  return createHash('sha256').update(String(value)).digest()
}

// Constant-time compare via fixed-length digests, so a missing/malformed header
// never throws (a raw length mismatch in timingSafeEqual does) and never leaks
// timing information about the real secret's length.
function safeEqual(a, b) {
  return timingSafeEqual(sha256(a), sha256(b))
}

function pruneDedupeMap(now) {
  for (const [key, expiry] of recentEvents) {
    if (expiry <= now) recentEvents.delete(key)
  }
}

export default defineEventHandler(async (event) => {
  const secret = process.env.GITHUB_PR_WEBHOOK_SECRET
  // Fail closed: an unset/short secret must never make every request "authenticated".
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw createError({ statusCode: 503, statusMessage: 'PR webhook not configured' })
  }

  const provided = getRequestHeader(event, 'authorization') || ''
  const expected = `Bearer ${secret}`
  if (!safeEqual(provided, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const now = Date.now()
  requestTimestamps = requestTimestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS)
  if (requestTimestamps.length >= RATE_LIMIT_MAX) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
  }
  requestTimestamps.push(now)

  const contentLength = Number(getHeader(event, 'content-length') || 0)
  if (contentLength > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Payload too large' })
  }

  let body
  try {
    body = await readBody(event)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON body' })
  }

  const action = body?.action
  const prNumber = Number(body?.pr?.number)
  const title = typeof body?.pr?.title === 'string' ? body.pr.title.slice(0, 10000) : ''
  const prBody = typeof body?.pr?.body === 'string' ? body.pr.body.slice(0, 10000) : ''
  const author = typeof body?.pr?.author === 'string' ? body.pr.author.slice(0, 256) : null

  if (!['opened', 'merged'].includes(action)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or missing "action"' })
  }
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or missing "pr.number"' })
  }

  const dedupeKey = `${action}:${prNumber}`
  pruneDedupeMap(now)
  if (recentEvents.has(dedupeKey)) {
    return { ok: true, deduped: true }
  }
  recentEvents.set(dedupeKey, now + DEDUPE_WINDOW_MS)

  // This deployment only ever represents one branch — never trust a branch name out
  // of the request body to pick between the dev/prod channel or DB rows.
  //
  // NODE_ENV can't be used here: the dev deployment also runs its built Nuxt server
  // with NODE_ENV=production (see ecosystem.config.cjs), since that's required for
  // the built output to run correctly, not to indicate which branch this deployment
  // tracks. DEPLOY_ENV is a separate, deployment-specific env var set in each
  // server's .env — 'dev' on the dev box, unset/anything else (defaults to prod) on
  // the production box.
  const isProd = process.env.DEPLOY_ENV !== 'dev'
  const branch = isProd ? 'master' : 'dev'
  const channelField = isProd ? 'prodPrDiscordChannelId' : 'devPrDiscordChannelId'

  const config = await db.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { [channelField]: true }
  })
  const channelId = (config?.[channelField] || '').trim()
  if (!channelId) {
    // Not configured for this environment — quietly no-op rather than error.
    return { ok: true, skipped: 'no channel configured' }
  }

  // Always build the link ourselves from a hardcoded repo slug + the validated PR
  // number, rather than trusting a URL string out of the request payload.
  const url = `https://github.com/${REPO_SLUG}/pull/${prNumber}`

  const sent = await sendPrNotification(channelId, {
    number: prNumber,
    title,
    body: prBody,
    url,
    author,
    action,
    branch
  })

  if (!sent) {
    throw createError({ statusCode: 502, statusMessage: 'Failed to send Discord message' })
  }

  return { ok: true }
})
