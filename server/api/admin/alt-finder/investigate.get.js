/**
 * Alt Account Investigator — admin endpoint.
 *
 * Given one banned account (optionally plus its already-known alts), ranks
 * other accounts by how much evidence says they are the same person, and
 * returns per-signal reasoning.
 *
 * Read-only by design. It deliberately does NOT ban, seize, or dissolve — an
 * admin reviews the evidence and hands off to the existing enforcement tools.
 */

import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { gatherEvidence } from '@/server/utils/altAccountEvidence'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { createHash } from 'crypto'

// Short TTL: these feed ban decisions, and an admin who bans an alt and re-runs
// must not be shown a stale ranking. The Recompute button (force=1) bypasses it.
const CACHE_TTL_SECONDS = 300
const LOCK_TTL_SECONDS = 120
const RATE_LIMIT_WINDOW_SEC = 60
const RATE_LIMIT_MAX = 10

// Bumped whenever the scoring or payload shape changes, so a deploy can never
// serve an old-shaped blob into new code.
const SCHEMA_VERSION = 'v1'

const UUID_RE = /^[0-9a-f-]{36}$/i

function firstValue(v) {
  return Array.isArray(v) ? v[0] : v
}

export default defineEventHandler(async (event) => {
  // Read the admin flags straight from the DB rather than via an internal
  // $fetch('/api/auth/me'): it avoids an HTTP round-trip through the whole
  // middleware stack (including an outbound Discord call) and, unlike an
  // isAdmin-only check, refuses a suspended or deactivated admin.
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, isAdmin: true, banned: true, active: true }
  })
  if (!me?.isAdmin || me.banned || me.active === false) {
    throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  }

  // This endpoint is expensive and returns bulk identity evidence — rate limit
  // it per admin.
  const rlKey = `admin:alt-finder:rl:${me.id}`
  const hits = await redis.incr(rlKey)
  if (hits === 1) await redis.expire(rlKey, RATE_LIMIT_WINDOW_SEC)
  if (hits > RATE_LIMIT_MAX) {
    throw createError({ statusCode: 429, statusMessage: 'Too many investigations — slow down.' })
  }

  const query = getQuery(event)
  const rawUsername = String(firstValue(query.username) || '').trim()
  const rawUserId = String(firstValue(query.userId) || '').trim()
  if (!rawUsername && !rawUserId) {
    throw createError({ statusCode: 400, statusMessage: 'username or userId is required' })
  }
  if (rawUserId && !UUID_RE.test(rawUserId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid userId' })
  }

  const page = Math.max(parseInt(firstValue(query.page) || '1', 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(firstValue(query.limit) || '50', 10) || 50, 1), 200)
  const force = String(firstValue(query.force) || '') === '1'

  // Known alts widen the seed cluster. Scoring against the whole cluster is
  // what makes this work on someone who changed IP, browser and Discord
  // account — he cannot also abandon the network he came back for.
  const extraUsernames = String(firstValue(query.knownAlts) || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 25)

  // Resolve to a real user BEFORE building any cache key, so the key can never
  // contain raw user input.
  const suspect = await prisma.user.findFirst({
    where: rawUserId ? { id: rawUserId } : { username: rawUsername },
    select: { id: true }
  })
  // Uniform 404 — don't leak whether a username exists.
  if (!suspect) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const paramHash = createHash('sha256')
    .update(JSON.stringify({ extra: [...extraUsernames].sort() }))
    .digest('hex')
    .slice(0, 16)
  const cacheKey = `admin:alt-finder:${SCHEMA_VERSION}:${suspect.id}:${paramHash}`
  const lockKey = `${cacheKey}:lock`

  // Never let a browser or intermediary retain identity evidence.
  setHeader(event, 'Cache-Control', 'no-store')

  let report
  if (!force) {
    try {
      const hit = await redis.get(cacheKey)
      if (hit) {
        const parsed = JSON.parse(hit)
        // Validate the shape rather than trusting whatever is in Redis.
        if (parsed && Array.isArray(parsed.results) && parsed.suspect) report = parsed
      }
    } catch {}
  }

  if (!report) {
    // Single-flight: two admins opening the page together shouldn't both run
    // the full investigation.
    let gotLock = false
    try {
      gotLock = (await redis.set(lockKey, me.id, 'EX', LOCK_TTL_SECONDS, 'NX')) === 'OK'
    } catch {
      gotLock = true // Redis down — degrade to computing rather than failing
    }
    if (!gotLock) {
      throw createError({
        statusCode: 202,
        statusMessage: 'An investigation for this account is already running — retry shortly.'
      })
    }

    try {
      report = await gatherEvidence(prisma, {
        userId: suspect.id,
        extraUsernames
      })
      if (!report) throw createError({ statusCode: 404, statusMessage: 'Not found' })
      try {
        await redis.set(cacheKey, JSON.stringify(report), 'EX', CACHE_TTL_SECONDS)
      } catch {}
    } finally {
      try { await redis.del(lockKey) } catch {}
    }
  }

  // Audit the access — this is a bulk identity-evidence surface, so who ran it
  // and against whom should be attributable. Counts only: never write the
  // evidence itself into a permanent, un-TTL'd table that lands in every
  // nightly pg_dump.
  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:AltFinder',
    key: 'investigate',
    prevValue: null,
    newValue: {
      resultCount: report.results.length,
      topBits: report.results[0]?.bits ?? 0,
      candidatesConsidered: report.candidatesConsidered,
      knownAltsSupplied: extraUsernames.length
    },
    targetUserId: report.suspect.id,
    targetUsername: report.suspect.username
  })

  const total = report.results.length
  const start = (page - 1) * limit
  return {
    suspect: report.suspect,
    coverage: report.coverage,
    candidatesConsidered: report.candidatesConsidered,
    userCount: report.userCount,
    items: report.results.slice(start, start + limit),
    total,
    page,
    limit
  }
})
