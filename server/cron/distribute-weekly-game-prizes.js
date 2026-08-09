// Game Weekly Leaderboard prize auto-distribution. Called every minute from the main cron
// runner, same pattern as server/cron/create-weekly-czone-contest.js: load all active configs
// with one cheap query, skip everything except the exact scheduled minute, and guard against
// double-firing with an idempotency marker.
import { prisma } from '../prisma.js'
import { getCSTDateParts, runGameWeeklyPrizeDistribution } from '../utils/gameWeeklyPrizeDistribution.js'

export async function checkAndDistributeWeeklyGamePrizes() {
  const { dayOfWeek, hour, minute, dateStr } = getCSTDateParts(new Date())

  const configs = await prisma.gameWeeklyPrizeConfig.findMany({
    where: { isActive: true, dayOfWeek, hour, minute, NOT: { lastDistributedFor: dateStr } },
    select: { id: true, game: true }
  })
  if (!configs.length) return

  for (const config of configs) {
    try {
      const result = await runGameWeeklyPrizeDistribution(config.id)
      if (!result.skipped) {
        console.log(`[game-weekly-prize] ${config.game}: ${result.winner ? `awarded to ${result.winner.userId} (${result.awardCtoon ? 'ctoon' : 'points'})` : 'no winner this week'}`)
      }
    } catch (err) {
      console.error(`[game-weekly-prize] Error distributing for ${config.game}:`, err.message)
    }
  }
}
