// GET /api/admin/og-tournaments — every tournament with the numbers an admin needs at a glance.
import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const now = new Date()
  const rows = await prisma.ogGtoonTournament.findMany({
    orderBy: { optInStartAt: 'desc' },
    take: 200,
    select: {
      id: true, name: true, status: true, format: true, optInStartAt: true, optInEndAt: true, roundWindowHours: true,
      tournamentCompletedAt: true, lastAdvancedAt: true, requirePrizeApproval: true, prizesQueuedAt: true, prizesApprovedAt: true,
      winner: { select: { username: true } }
    }
  })
  const ids = rows.map(r => r.id)
  const [opt, needs, overdue, grants] = await Promise.all([
    prisma.ogGtoonTournamentOptIn.groupBy({ by: ['tournamentId'], where: { tournamentId: { in: ids }, isActive: true }, _count: { _all: true } }),
    prisma.ogGtoonTournamentMatch.groupBy({ by: ['tournamentId'], where: { tournamentId: { in: ids }, needsAdmin: true, lockedAt: null }, _count: { _all: true } }),
    prisma.ogGtoonTournamentMatch.groupBy({ by: ['tournamentId'], where: { tournamentId: { in: ids }, lockedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: now } }, _count: { _all: true } }),
    prisma.ogGtoonTournamentPrizeGrant.groupBy({ by: ['tournamentId', 'status'], where: { tournamentId: { in: ids } }, _count: { _all: true } })
  ])
  const m = (list) => new Map(list.map(x => [x.tournamentId, x._count._all]))
  const optBy = m(opt); const needsBy = m(needs); const overdueBy = m(overdue)
  const grantBy = new Map()
  for (const g of grants) {
    const cur = grantBy.get(g.tournamentId) || {}
    cur[g.status] = g._count._all
    grantBy.set(g.tournamentId, cur)
  }
  return rows.map(({ winner, ...t }) => ({
    ...t, winnerUsername: winner?.username || null,
    optInCount: optBy.get(t.id) || 0,
    needsAdminCount: needsBy.get(t.id) || 0,
    overdueCount: overdueBy.get(t.id) || 0,
    prizeCounts: grantBy.get(t.id) || {}
  }))
})
