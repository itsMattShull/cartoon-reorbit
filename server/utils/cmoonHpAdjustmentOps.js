// server/utils/cmoonHpAdjustmentOps.js
// Prisma-touching operations for the admin "Manage User HP" tool
// (server/api/admin/users/[id]/hp.get.js/.post.js, server/api/admin/users/hp-mass-adjust.post.js).
// Validation lives in the import-free cmoonHpAdjustmentValidation.js so it stays unit-testable —
// see that file's own comment on why this one (which pulls in server/prisma.js) can't be.
import { prisma } from '../prisma.js'
import { getGlobalConfig, getNaturalCombatMaxHp } from './cmoon.js'
import { combinePlayerMaxHp, computeHpAdjustmentForTarget, PLAYER_MAX_HP } from './cmoonEnemyBattle.js'
import { USER_TABLE_BULK_WRITE_LOCK_KEY } from './dbLocks.js'

async function resolveDefaultHp(config) {
  const cfg = config || await getGlobalConfig()
  return Number.isInteger(cfg?.cMoonEnemyBattleDefaultHp) && cfg.cMoonEnemyBattleDefaultHp > 0
    ? cfg.cMoonEnemyBattleDefaultHp
    : PLAYER_MAX_HP
}

// One user's current HP picture for the admin detail/search panel: their natural HP (what
// getPlayerCombatMaxHp would return with zero adjustment), their stored adjustment, and the
// resulting effective HP — i.e. exactly what getPlayerCombatMaxHp() actually returns for them.
export async function getUserHpDetail(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      cMoonHpAdjustment: true,
      currentCMoonRank: { select: { name: true, tier: { select: { sortOrder: true } } } },
    },
  })
  if (!user) return null

  const defaultHp = await resolveDefaultHp()
  const sortOrder = user.currentCMoonRank?.tier?.sortOrder ?? null
  const naturalHp = await getNaturalCombatMaxHp(sortOrder, defaultHp)
  const adjustment = Number(user.cMoonHpAdjustment) || 0
  const effectiveHp = combinePlayerMaxHp(naturalHp, 0, adjustment)

  return {
    id: user.id,
    username: user.username,
    rankName: user.currentCMoonRank?.name || null,
    naturalHp,
    adjustment,
    effectiveHp,
  }
}

// Sets one user's effective cMoon battle HP to exactly `targetHp` by solving for the
// cMoonHpAdjustment that bridges their current natural HP to it — see
// computeHpAdjustmentForTarget's own comment on why this is additive, not an override.
export async function setUserHp(userId, targetHp) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      cMoonHpAdjustment: true,
      currentCMoonRank: { select: { tier: { select: { sortOrder: true } } } },
    },
  })
  if (!user) return null

  const defaultHp = await resolveDefaultHp()
  const sortOrder = user.currentCMoonRank?.tier?.sortOrder ?? null
  const naturalHp = await getNaturalCombatMaxHp(sortOrder, defaultHp)
  const previousAdjustment = Number(user.cMoonHpAdjustment) || 0
  const adjustment = computeHpAdjustmentForTarget(naturalHp, targetHp)

  await prisma.user.update({ where: { id: userId }, data: { cMoonHpAdjustment: adjustment } })

  return {
    id: user.id,
    username: user.username,
    naturalHp,
    adjustment,
    effectiveHp: combinePlayerMaxHp(naturalHp, 0, adjustment),
    // Rank can't have changed between the read above and the update, so this is exactly what a
    // separate "before" getUserHpDetail(userId) call would have computed — returned here instead
    // so callers (server/api/admin/users/[id]/hp.post.js) don't need that second round-trip just
    // to log a before/after diff.
    previousAdjustment,
    previousEffectiveHp: combinePlayerMaxHp(naturalHp, 0, previousAdjustment),
  }
}

// Batched set-based updates mirroring server/cron/cmoon-points-aggregate.js's own
// advisory-lock + id-ordered-batch + UPDATE...FROM shape (see that file's header comment) — the
// natural pattern for "touch every row in User" without holding one giant lock for the whole
// table at once. Shares USER_TABLE_BULK_WRITE_LOCK_KEY with the other full-table User jobs so
// this can never deadlock against them; if another such job holds it, this one simply reports
// itself skipped rather than racing it (an admin can just retry the request).
const BATCH_SIZE = 100

export async function massAdjustHp({ mode, value }) {
  const [{ locked }] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${USER_TABLE_BULK_WRITE_LOCK_KEY}::bigint) AS locked`
  if (!locked) {
    return { changed: 0, skipped: true, reason: 'Another bulk user-table job is running — try again shortly' }
  }

  try {
    const defaultHp = await resolveDefaultHp()
    let changed = 0
    let lastId = ''
    for (;;) {
      const batch = await prisma.$queryRaw`SELECT id FROM "User" WHERE id > ${lastId} ORDER BY id LIMIT ${BATCH_SIZE}`
      if (!batch.length) break
      const batchEnd = batch[batch.length - 1].id

      const changedRows = mode === 'delta'
        ? await prisma.$queryRaw`
            UPDATE "User" u
            SET "cMoonHpAdjustment" = u."cMoonHpAdjustment" + ${value}
            WHERE u.id > ${lastId} AND u.id <= ${batchEnd}
            RETURNING u.id
          `
        : await prisma.$queryRaw`
            WITH nat AS (
              SELECT u.id AS user_id,
                GREATEST(1, ${defaultHp} + COALESCE(bonus.total, 0)) AS natural_hp
              FROM "User" u
              LEFT JOIN "CMoonRank" cr ON cr.id = u."currentCMoonRankId"
              LEFT JOIN LATERAL (
                SELECT SUM(crt."cMoonEnemyBattleHpBonus") AS total
                FROM "CMoonRankTier" crt
                WHERE cr."tierId" IS NOT NULL AND crt."sortOrder" <= (
                  SELECT t."sortOrder" FROM "CMoonRankTier" t WHERE t.id = cr."tierId"
                )
              ) bonus ON true
              WHERE u.id > ${lastId} AND u.id <= ${batchEnd}
            )
            UPDATE "User" u
            SET "cMoonHpAdjustment" = ${value} - nat.natural_hp
            FROM nat
            WHERE u.id = nat.user_id
              AND u."cMoonHpAdjustment" IS DISTINCT FROM (${value} - nat.natural_hp)
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
