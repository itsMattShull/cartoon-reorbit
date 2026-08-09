// Core logic for distributing a Game Weekly Leaderboard prize, shared by the per-minute cron
// (server/cron/distribute-weekly-game-prizes.js) and the admin "distribute now" test action
// (server/api/admin/game-weekly-leaderboard/[game]/distribute-now.post.js) so both paths use
// the exact same idempotency guard and locking — a manual test click can never double-award
// alongside a cron tick landing the same minute.
import { prisma } from '@/server/prisma'
import { mintQueue } from '@/server/utils/queues'
import { findWeeklyWinner } from '@/server/utils/gameWeeklyLeaderboardGames'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// America/Chicago wall-clock parts, same approach as server/cron/create-weekly-czone-contest.js.
export function getCSTDateParts(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric',
      weekday: 'short', hour12: false,
    }).formatToParts(date).map(p => [p.type, p.value])
  )
  const DOW_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    dayOfWeek: DOW_MAP[parts.weekday] ?? -1,
    hour: parseInt(parts.hour, 10),
    minute: parseInt(parts.minute, 10),
    dateStr: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
  }
}

/**
 * Runs (or re-runs, with `force`) the distribution for one config.
 * @param {string} configId
 * @param {{ force?: boolean }} opts  `force` bypasses the "already distributed this CST day"
 *   guard — used only by the admin's manual test-distribution action, never by the cron.
 */
export async function runGameWeeklyPrizeDistribution(configId, { force = false } = {}) {
  const config = await prisma.gameWeeklyPrizeConfig.findUnique({
    where: { id: configId },
    include: { ctoon: { select: { id: true, name: true, quantity: true, totalMinted: true } } }
  })
  if (!config) return { skipped: true, reason: 'not_found' }
  if (!config.isActive && !force) return { skipped: true, reason: 'inactive' }

  const weekEnd = new Date()
  const weekStart = new Date(weekEnd.getTime() - WEEK_MS)
  const { dateStr } = getCSTDateParts(weekEnd)

  if (!force && config.lastDistributedFor === dateStr) return { skipped: true, reason: 'already_distributed' }

  const winner = await findWeeklyWinner(config.game, weekStart, weekEnd)

  let awardCtoon = false
  let wasRepeatWinner = false
  let ctoonUnavailable = false
  if (winner) {
    const priorWin = await prisma.gameWeeklyPrizeDistribution.findFirst({
      where: { configId: config.id, winnerUserId: winner.userId, ctoonId: config.ctoonId },
      select: { id: true }
    })
    wasRepeatWinner = !!priorWin
    ctoonUnavailable = config.ctoon.quantity !== null && config.ctoon.totalMinted >= config.ctoon.quantity
    awardCtoon = !wasRepeatWinner && !ctoonUnavailable
  }

  const result = await prisma.$transaction(async (tx) => {
    // Namespaced two-arg advisory lock: game-weekly-prize configs must never share a lock
    // keyspace with the single-arg pg_advisory_xact_lock(hashtext(userId)) calls used
    // elsewhere (server/utils/gamePoints.js etc.) — a cuid config id colliding with an
    // unrelated user id's hash would otherwise block on that user's transaction.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('game-weekly-prize'), hashtext(${config.id}))`

    // Re-check inside the lock: closes the race between a cron tick and a manual "distribute
    // now" (or two overlapping cron ticks) landing on the same config at once.
    const fresh = await tx.gameWeeklyPrizeConfig.findUnique({ where: { id: config.id } })
    if (!fresh) return { skipped: true, reason: 'not_found' }
    if (!force && fresh.lastDistributedFor === dateStr) return { skipped: true, reason: 'already_distributed' }

    let distribution = null
    if (winner) {
      distribution = await tx.gameWeeklyPrizeDistribution.create({
        data: {
          configId: config.id,
          game: config.game,
          weekStart,
          weekEnd,
          winnerUserId: winner.userId,
          score: winner.score,
          ctoonId: awardCtoon ? config.ctoonId : null,
          pointsAwarded: awardCtoon ? null : config.fallbackPoints,
          wasRepeatWinner
        }
      })

      if (!awardCtoon) {
        const updated = await tx.userPoints.upsert({
          where: { userId: winner.userId },
          create: { userId: winner.userId, points: config.fallbackPoints },
          update: { points: { increment: config.fallbackPoints } }
        })
        await tx.pointsLog.create({
          data: {
            userId: winner.userId,
            points: config.fallbackPoints,
            total: updated.points,
            method: 'GAME_WEEKLY_PRIZE',
            direction: 'increase'
          }
        })
      }
    }

    await tx.gameWeeklyPrizeConfig.update({
      where: { id: config.id },
      data: { lastDistributedFor: dateStr }
    })

    return { skipped: false, distribution, winner, awardCtoon, wasRepeatWinner, ctoonUnavailable }
  })

  // Mint jobs can't be rolled back, so they're queued only after the transaction that recorded
  // the distribution has committed — same ordering as
  // server/api/admin/czone-contest/[id]/distribute.post.js.
  if (!result.skipped && result.awardCtoon && result.winner) {
    await mintQueue.add('mintCtoon', {
      userId: result.winner.userId,
      ctoonId: config.ctoonId,
      isSpecial: true,
      method: 'GAME_WEEKLY_PRIZE'
    })
  }

  return result
}
