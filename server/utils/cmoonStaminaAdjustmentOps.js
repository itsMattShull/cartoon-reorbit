// server/utils/cmoonStaminaAdjustmentOps.js
// Prisma-touching operations for the "Manage User HP" admin tool's Stamina section (server/api/
// admin/users/[id]/stamina.get.js/.post.js, server/api/admin/users/stamina-mass-adjust.post.js).
// Mirrors cmoonHpAdjustmentOps.js, simplified: stamina has no per-rank bonus term to look up (see
// combinePlayerMaxStamina's own comment in cmoonEnemyBattle.js), so "natural" stamina is just the
// site-wide starting value — no second query, no CMoonRankTier join, in either the single-user or
// batched-mass-adjust path. Validation lives in the import-free cmoonStaminaAdjustmentValidation.js
// so it stays unit-testable — see that file's own comment.
import { prisma } from '../prisma.js'
import { getGlobalConfig } from './cmoon.js'
import { combinePlayerMaxStamina, computeStaminaAdjustmentForTarget } from './cmoonEnemyBattle.js'
import { USER_TABLE_BULK_WRITE_LOCK_KEY } from './dbLocks.js'

async function resolveDefaultStamina(config) {
  const cfg = config || await getGlobalConfig()
  return Number(cfg?.cMoonEnemyBattleStartingStamina) || 0
}

// One user's current stamina picture for the admin detail/search panel: their natural stamina
// (the site-wide starting value, with zero adjustment), their stored adjustment, and the
// resulting effective stamina — i.e. exactly what their NEXT solo battle's playerMaxStamina
// would snapshot to (see server/api/cmoon/battle/start.post.js).
export async function getUserStaminaDetail(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, cMoonStaminaAdjustment: true },
  })
  if (!user) return null

  const naturalStamina = await resolveDefaultStamina()
  const adjustment = Number(user.cMoonStaminaAdjustment) || 0
  const effectiveStamina = combinePlayerMaxStamina(naturalStamina, adjustment)

  return { id: user.id, username: user.username, naturalStamina, adjustment, effectiveStamina }
}

// Sets one user's effective stamina to exactly `targetStamina` by solving for the
// cMoonStaminaAdjustment that bridges their natural stamina to it — see
// computeStaminaAdjustmentForTarget's own comment on why this is additive, not an override.
export async function setUserStamina(userId, targetStamina) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, cMoonStaminaAdjustment: true },
  })
  if (!user) return null

  const naturalStamina = await resolveDefaultStamina()
  const previousAdjustment = Number(user.cMoonStaminaAdjustment) || 0
  const adjustment = computeStaminaAdjustmentForTarget(naturalStamina, targetStamina)

  await prisma.user.update({ where: { id: userId }, data: { cMoonStaminaAdjustment: adjustment } })

  return {
    id: user.id,
    username: user.username,
    naturalStamina,
    adjustment,
    effectiveStamina: combinePlayerMaxStamina(naturalStamina, adjustment),
    // Nothing can have changed naturalStamina between the read above and the update (it's a
    // flat site-wide constant, not derived from anything user-specific), so this is exactly
    // what a separate "before" getUserStaminaDetail(userId) call would have computed — returned
    // here instead so the endpoint doesn't need that second round-trip just to log a diff.
    previousAdjustment,
    previousEffectiveStamina: combinePlayerMaxStamina(naturalStamina, previousAdjustment),
  }
}

// Batched set-based updates — same advisory-lock + id-ordered-batch + UPDATE...FROM shape as
// massAdjustHp in cmoonHpAdjustmentOps.js (see that function's own comment), simplified further
// here since the absolute-mode subquery needs no per-user join at all: every row's natural
// stamina is the same flat constant.
const BATCH_SIZE = 100

export async function massAdjustStamina({ mode, value }) {
  const [{ locked }] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${USER_TABLE_BULK_WRITE_LOCK_KEY}::bigint) AS locked`
  if (!locked) {
    return { changed: 0, skipped: true, reason: 'Another bulk user-table job is running — try again shortly' }
  }

  try {
    const naturalStamina = await resolveDefaultStamina()
    const absoluteAdjustment = mode === 'absolute' ? value - naturalStamina : null
    let changed = 0
    let lastId = ''
    for (;;) {
      const batch = await prisma.$queryRaw`SELECT id FROM "User" WHERE id > ${lastId} ORDER BY id LIMIT ${BATCH_SIZE}`
      if (!batch.length) break
      const batchEnd = batch[batch.length - 1].id

      const changedRows = mode === 'delta'
        ? await prisma.$queryRaw`
            UPDATE "User" u
            SET "cMoonStaminaAdjustment" = u."cMoonStaminaAdjustment" + ${value}
            WHERE u.id > ${lastId} AND u.id <= ${batchEnd}
            RETURNING u.id
          `
        : await prisma.$queryRaw`
            UPDATE "User" u
            SET "cMoonStaminaAdjustment" = ${absoluteAdjustment}
            WHERE u.id > ${lastId} AND u.id <= ${batchEnd}
              AND u."cMoonStaminaAdjustment" IS DISTINCT FROM ${absoluteAdjustment}
            RETURNING u.id
          `
      changed += changedRows.length
      lastId = batchEnd
    }
    return { changed, skipped: false }
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${USER_TABLE_BULK_WRITE_LOCK_KEY}::bigint)`
  }
}
