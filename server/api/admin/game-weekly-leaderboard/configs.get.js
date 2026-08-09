// GET /api/admin/game-weekly-leaderboard/configs — list every supported game with its config
// (or null if unconfigured) and its 5 most recent distributions.
import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { GAME_WEEKLY_LEADERBOARD_GAMES } from '@/server/utils/gameWeeklyLeaderboardGames'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const games = Object.keys(GAME_WEEKLY_LEADERBOARD_GAMES)
  const configs = await prisma.gameWeeklyPrizeConfig.findMany({
    where: { game: { in: games } },
    include: { ctoon: { select: { id: true, name: true, assetPath: true, rarity: true, quantity: true, totalMinted: true } } }
  })
  const configByGame = Object.fromEntries(configs.map(c => [c.game, c]))

  const configIds = configs.map(c => c.id)
  const recentByConfig = {}
  if (configIds.length) {
    const recent = await prisma.gameWeeklyPrizeDistribution.findMany({
      where: { configId: { in: configIds } },
      orderBy: { distributedAt: 'desc' },
      take: 5 * configIds.length,
      include: {
        winner: { select: { id: true, username: true, avatar: true } },
        ctoon: { select: { id: true, name: true, assetPath: true } }
      }
    })
    for (const d of recent) {
      recentByConfig[d.configId] = recentByConfig[d.configId] || []
      if (recentByConfig[d.configId].length < 5) recentByConfig[d.configId].push(d)
    }
  }

  return games.map(game => ({
    game,
    label: GAME_WEEKLY_LEADERBOARD_GAMES[game].label,
    config: configByGame[game] || null,
    recentDistributions: configByGame[game] ? (recentByConfig[configByGame[game].id] || []) : []
  }))
})
