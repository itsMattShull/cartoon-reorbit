// server/utils/cmoon.js
// Shared logic for the cMoon (faction) feature: eligibility/deadline math, atomic
// self-selection, cron auto-assignment, and prize granting. Kept in one place so
// the feature is easy to rip out later — see GlobalGameConfig.cMoonEnabled.
import { prisma } from '../prisma.js'
import { mintQueue } from './queues.js'

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
export const DISCORD_SNOWFLAKE_RE = /^\d{17,20}$/

export function isValidHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_RE.test(value)
}

export function isValidDiscordSnowflake(value) {
  return typeof value === 'string' && DISCORD_SNOWFLAKE_RE.test(value)
}

// GlobalGameConfig is read on the selection page/API on every load; cache briefly
// in-process to avoid hammering the singleton row (mirrors the pattern used by
// other hot config reads in this codebase, e.g. server/middleware/daily-points.js).
let cachedConfig = null
let cachedConfigAt = 0
const CONFIG_TTL_MS = 30_000

export async function getGlobalConfig({ fresh = false } = {}) {
  const now = Date.now()
  if (!fresh && cachedConfig && (now - cachedConfigAt) < CONFIG_TTL_MS) return cachedConfig
  const cfg = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  cachedConfig = cfg
  cachedConfigAt = now
  return cfg
}

export function invalidateGlobalConfigCache() {
  cachedConfig = null
  cachedConfigAt = 0
}

// A user's personal deadline to pick a cMoon before they're auto-assigned:
//  - joined on/after the feature's launch (cMoonEnabledAt): 3 days from their own join date
//  - joined before launch (an "existing" user): the shared cMoonSelectionDeadlineAt
// Returns null if the feature isn't enabled or the user already has a cMoon.
export function computeCMoonDeadline(user, config) {
  if (!config?.cMoonEnabled || !config.cMoonEnabledAt) return null
  if (user.cMoonId) return null
  const createdAt = new Date(user.createdAt)
  const enabledAt = new Date(config.cMoonEnabledAt)
  if (createdAt >= enabledAt) {
    return new Date(createdAt.getTime() + THREE_DAYS_MS)
  }
  return config.cMoonSelectionDeadlineAt ? new Date(config.cMoonSelectionDeadlineAt) : null
}

export const CMOON_SELECT_ERRORS = {
  DISABLED: 'CMOON_DISABLED',
  NOT_FOUND: 'CMOON_NOT_FOUND',
  ALREADY_ASSIGNED: 'CMOON_ALREADY_ASSIGNED',
  DEADLINE_PASSED: 'CMOON_DEADLINE_PASSED',
}

class CMoonError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

// Grants a cMoon's configured prize cToons to a user. Called only after the
// selection/assignment transaction has committed (mint jobs are not
// transactional, so they must never run inside a $transaction that might roll back).
async function grantCMoonPrizes(userId, cMoonId) {
  const prizes = await prisma.cMoonPrizeCtoon.findMany({ where: { cMoonId } })
  for (const prize of prizes) {
    const qty = Math.max(1, Number(prize.quantity || 1))
    for (let i = 0; i < qty; i++) {
      await mintQueue.add('mintCtoon', {
        userId,
        ctoonId: prize.ctoonId,
        isSpecial: true,
        method: 'CMOON_PRIZE',
      })
    }
  }
}

// User-initiated selection. Atomic: the `updateMany({ where: { cMoonId: null } })`
// clause is the concurrency gate — Postgres serializes concurrent writers on the
// same row, and the second writer sees count===0 and is rejected. This prevents
// double-selection (and the double prize grant that would follow it) under
// concurrent double-submits.
export async function selectCMoonForUser(userId, cMoonId) {
  const config = await getGlobalConfig({ fresh: true })
  if (!config?.cMoonEnabled) throw new CMoonError(CMOON_SELECT_ERRORS.DISABLED)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, createdAt: true, cMoonId: true },
  })
  if (!user) throw new CMoonError(CMOON_SELECT_ERRORS.NOT_FOUND)
  if (user.cMoonId) throw new CMoonError(CMOON_SELECT_ERRORS.ALREADY_ASSIGNED)

  const deadline = computeCMoonDeadline(user, config)
  if (deadline && new Date() > deadline) throw new CMoonError(CMOON_SELECT_ERRORS.DEADLINE_PASSED)

  const cmoon = await prisma.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true } })
  if (!cmoon) throw new CMoonError(CMOON_SELECT_ERRORS.NOT_FOUND)

  const assigned = await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where: { id: userId, cMoonId: null },
      data: { cMoonId: cmoon.id, cMoonSelectedAt: new Date(), cMoonAutoAssigned: false },
    })
    if (result.count === 0) throw new CMoonError(CMOON_SELECT_ERRORS.ALREADY_ASSIGNED)
    await tx.cMoon.update({ where: { id: cmoon.id }, data: { memberCount: { increment: 1 } } })
    return cmoon.id
  })

  await grantCMoonPrizes(userId, assigned)
  return assigned
}

// Assigns one user to whatever cMoon currently has the fewest members.
// `FOR UPDATE` on the chosen CMoon row serializes concurrent assignments so two
// callers can't both read the same "smallest" moon before either commits.
async function assignSmallestCMoonToUser(userId) {
  return prisma.$transaction(async (tx) => {
    const [smallest] = await tx.$queryRaw`
      SELECT id FROM "CMoon" ORDER BY "memberCount" ASC, id ASC LIMIT 1 FOR UPDATE
    `
    if (!smallest) return null

    const result = await tx.user.updateMany({
      where: { id: userId, cMoonId: null },
      data: { cMoonId: smallest.id, cMoonSelectedAt: new Date(), cMoonAutoAssigned: true },
    })
    if (result.count === 0) return null

    await tx.cMoon.update({ where: { id: smallest.id }, data: { memberCount: { increment: 1 } } })
    return smallest.id
  })
}

// Daily cron entry point. Finds users whose personal deadline has passed and
// haven't picked a cMoon, auto-assigns them to the smallest cMoon, and grants
// that cMoon's prizes. Capped per run so a large backlog can't stall the shared
// cron process or flood the mint queue in one shot; it drains across days.
export async function autoAssignExpiredCMoonUsers({ batchLimit = 200, maxBatches = 5 } = {}) {
  const config = await getGlobalConfig({ fresh: true })
  if (!config?.cMoonEnabled || !config.cMoonEnabledAt) return { processed: 0 }

  const cmoonCount = await prisma.cMoon.count()
  if (cmoonCount === 0) return { processed: 0 }

  const now = new Date()
  const newUserCutoff = new Date(now.getTime() - THREE_DAYS_MS)
  const enabledAt = new Date(config.cMoonEnabledAt)
  const globalDeadlinePassed = !!(config.cMoonSelectionDeadlineAt && now > new Date(config.cMoonSelectionDeadlineAt))

  const orClauses = [
    { createdAt: { gte: enabledAt, lt: newUserCutoff } },
  ]
  if (globalDeadlinePassed) {
    orClauses.push({ createdAt: { lt: enabledAt } })
  }

  let processed = 0
  for (let batch = 0; batch < maxBatches; batch++) {
    const candidates = await prisma.user.findMany({
      where: {
        cMoonId: null,
        active: true,
        banned: false,
        OR: orClauses,
      },
      select: { id: true },
      take: batchLimit,
    })
    if (candidates.length === 0) break

    for (const { id: userId } of candidates) {
      try {
        const cMoonId = await assignSmallestCMoonToUser(userId)
        if (cMoonId) {
          await grantCMoonPrizes(userId, cMoonId)
          processed++
        }
      } catch {
        // one user's failure shouldn't stop the rest of the batch
      }
    }

    if (candidates.length < batchLimit) break
  }

  return { processed }
}

export { CMoonError }
