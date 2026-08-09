// POST /api/admin/game-weekly-leaderboard/[game]/distribute-now — manual test trigger. Runs
// the exact same core distribution function the cron uses, over the same idempotency guard,
// so this can't double-award alongside a cron tick landing the same minute. `force: true` in
// the body bypasses the "already distributed today" guard for re-testing — it does NOT bypass
// the repeat-winner or sold-out checks.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { isSupportedGame } from '@/server/utils/gameWeeklyLeaderboardGames'
import { runGameWeeklyPrizeDistribution } from '@/server/utils/gameWeeklyPrizeDistribution'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const { game } = event.context.params
  if (!isSupportedGame(game)) throw createError({ statusCode: 400, statusMessage: 'Unsupported game' })

  const body = await readBody(event).catch(() => ({}))
  const force = body?.force === true

  const config = await prisma.gameWeeklyPrizeConfig.findUnique({ where: { game } })
  if (!config) throw createError({ statusCode: 404, statusMessage: 'No config exists for this game yet' })

  const result = await runGameWeeklyPrizeDistribution(config.id, { force })
  return result
})
