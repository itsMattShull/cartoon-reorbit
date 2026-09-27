// server/api/admin/cmoon-enemy-battle-logs.get.js
// Paginated, filterable feed of every cMoon Enemy Battle (CMoonEnemyBattle doubles as the live
// in-progress state and the permanent log row — see that model's own comment in
// prisma/schema.prisma) for the admin "cMoon Battle Logs" page. Same filter-bar/pagination shape
// as cmoon-points-log.get.js, but this table has a real `user` relation (unlike CMoonScoreLog),
// so a plain Prisma findMany + include covers it without raw SQL.
import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

const OUTCOMES = ['WIN', 'LOSS', 'ABANDONED']
const STATUSES = ['IN_PROGRESS', 'RESOLVED']

function parseStartYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T00:00:00.000Z`)
  return isNaN(d.getTime()) ? null : d
}

function parseEndYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T23:59:59.999Z`)
  return isNaN(d.getTime()) ? null : d
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const page = Math.max(parseInt(query.page || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(query.limit || '100', 10), 1), 200)
  const skip = (page - 1) * limit

  const username = typeof query.username === 'string' ? query.username.trim() : ''
  const outcome = typeof query.outcome === 'string' && OUTCOMES.includes(query.outcome) ? query.outcome : ''
  const status = typeof query.status === 'string' && STATUSES.includes(query.status) ? query.status : ''
  const cMoonId = typeof query.cMoonId === 'string' ? query.cMoonId.trim() : ''
  const enemyMemberId = typeof query.enemyMemberId === 'string' ? query.enemyMemberId.trim() : ''
  const from = query.from ? parseStartYMD(String(query.from)) : null
  const to = query.to ? parseEndYMD(String(query.to)) : null

  const where = {
    ...(username ? { user: { username: { contains: username, mode: 'insensitive' } } } : {}),
    ...(outcome ? { outcome } : {}),
    ...(status ? { status } : {}),
    ...(cMoonId ? { cMoonId } : {}),
    ...(enemyMemberId ? { enemyMemberId } : {}),
    ...((from || to) ? { startedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  }

  const [total, rows, cmoons, enemyMembers] = await Promise.all([
    prisma.cMoonEnemyBattle.count({ where }),
    prisma.cMoonEnemyBattle.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, username: true } },
        cMoon: { select: { id: true, name: true, color: true } },
        enemyMember: { select: { id: true, name: true, faction: { select: { id: true, name: true } } } },
      },
    }),
    prisma.cMoon.findMany({ select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } }),
    prisma.cMoonEnemyMember.findMany({
      select: { id: true, name: true, faction: { select: { name: true } } },
      orderBy: [{ factionId: 'asc' }, { name: 'asc' }],
    }),
  ])

  const items = rows.map(r => ({
    id: r.id,
    userId: r.userId,
    username: r.user?.username || null,
    cMoonId: r.cMoonId,
    cMoonName: r.cMoon?.name || null,
    cMoonColor: r.cMoon?.color || null,
    enemyMemberId: r.enemyMemberId,
    enemyName: r.enemyMember?.name || '(deleted)',
    factionName: r.enemyMember?.faction?.name || null,
    status: r.status,
    outcome: r.outcome,
    roundNumber: r.roundNumber,
    playerHpRemaining: r.playerHpRemaining,
    enemyHpRemaining: r.enemyHpRemaining,
    pointsAwarded: r.pointsAwarded,
    rewardsGranted: r.rewardsGranted,
    roundLog: r.roundLog,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
  }))

  return {
    items,
    total,
    page,
    limit,
    outcomes: OUTCOMES,
    statuses: STATUSES,
    cmoons,
    enemyMembers: enemyMembers.map(m => ({ id: m.id, name: m.faction?.name ? `${m.faction.name} — ${m.name}` : m.name })),
  }
})
