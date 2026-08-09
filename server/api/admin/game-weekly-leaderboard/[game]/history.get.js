// GET /api/admin/game-weekly-leaderboard/[game]/history?page=1 — paginated distribution
// history for one game's config.
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { isSupportedGame } from '@/server/utils/gameWeeklyLeaderboardGames'

const PAGE_SIZE = 20

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const { game } = event.context.params
  if (!isSupportedGame(game)) throw createError({ statusCode: 400, statusMessage: 'Unsupported game' })

  const { page = '1' } = getQuery(event)
  const pageNum = Math.max(1, parseInt(page, 10) || 1)

  const config = await prisma.gameWeeklyPrizeConfig.findUnique({ where: { game } })
  if (!config) return { items: [], total: 0, page: pageNum, pageSize: PAGE_SIZE }

  const [items, total] = await Promise.all([
    prisma.gameWeeklyPrizeDistribution.findMany({
      where: { configId: config.id },
      orderBy: { distributedAt: 'desc' },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        winner: { select: { id: true, username: true, avatar: true } },
        ctoon: { select: { id: true, name: true, assetPath: true } }
      }
    }),
    prisma.gameWeeklyPrizeDistribution.count({ where: { configId: config.id } })
  ])

  return { items, total, page: pageNum, pageSize: PAGE_SIZE }
})
