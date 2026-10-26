// server/api/admin/cmoon-enemy-analytics.get.js
// Usage analytics for the admin cMoon Enemy Analytics page: offer -> start rate (from
// CMoonEnemyOffer) and solo start -> completion rate (from CMoonEnemyBattle), overall and per
// enemy, over the last `days` days. Everything is aggregated in the database with groupBy, so the
// cost doesn't grow with the number of battles in the range. See server/utils/cmoonEnemyAnalytics.js
// for what counts as accepted, completed and abandoned.
import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { ABANDON_AFTER_MINUTES } from '@/server/utils/cmoonEnemyBattle'
import { summarizeOffers, summarizeSoloBattles } from '@/server/utils/cmoonEnemyAnalytics'

const DEFAULT_DAYS = 30
const MAX_DAYS = 365

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const parsed = parseInt(String(query.days ?? DEFAULT_DAYS), 10)
  const days = Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), MAX_DAYS) : DEFAULT_DAYS
  const now = new Date()
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const staleBefore = new Date(now.getTime() - ABANDON_AFTER_MINUTES * 60 * 1000)

  // Solo battles only (raidId null): a raid resolves on its own once it starts, so "did they
  // finish it" doesn't apply to raid participation the same way.
  const soloWhere = { raidId: null, startedAt: { gte: since } }

  const [offerGroups, acceptedGroups, resolvedGroups, staleGroups, freshGroups, firstOffer] = await Promise.all([
    prisma.cMoonEnemyOffer.groupBy({
      by: ['enemyMemberId', 'isRaidBoss'],
      where: { offeredAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.cMoonEnemyOffer.groupBy({
      by: ['enemyMemberId', 'isRaidBoss'],
      where: { offeredAt: { gte: since }, acceptedAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.cMoonEnemyBattle.groupBy({
      by: ['enemyMemberId', 'outcome'],
      where: { ...soloWhere, status: 'RESOLVED' },
      _count: { _all: true },
    }),
    prisma.cMoonEnemyBattle.groupBy({
      by: ['enemyMemberId'],
      where: { ...soloWhere, status: 'IN_PROGRESS', lastActionAt: { lt: staleBefore } },
      _count: { _all: true },
    }),
    prisma.cMoonEnemyBattle.groupBy({
      by: ['enemyMemberId'],
      where: { ...soloWhere, status: 'IN_PROGRESS', lastActionAt: { gte: staleBefore } },
      _count: { _all: true },
    }),
    // Offers only started being logged when this page shipped — surfaced so the page can say
    // "tracking since …" instead of implying a low start rate over a range with no offer data.
    prisma.cMoonEnemyOffer.aggregate({ _min: { offeredAt: true } }),
  ])

  // Per-enemy rows, keyed by enemyMemberId, holding the same grouped shapes the summarizers take.
  const byEnemy = new Map()
  const entry = (id) => {
    if (!byEnemy.has(id)) byEnemy.set(id, { offers: [], battles: [] })
    return byEnemy.get(id)
  }
  const acceptedKey = new Map(acceptedGroups.map(g => [`${g.enemyMemberId}|${g.isRaidBoss}`, g._count._all]))
  const offerRows = offerGroups.map(g => ({
    enemyMemberId: g.enemyMemberId,
    isRaidBoss: g.isRaidBoss,
    offered: g._count._all,
    accepted: acceptedKey.get(`${g.enemyMemberId}|${g.isRaidBoss}`) || 0,
  }))
  for (const r of offerRows) entry(r.enemyMemberId).offers.push(r)

  const battleRows = [
    ...resolvedGroups.map(g => ({ enemyMemberId: g.enemyMemberId, status: 'RESOLVED', outcome: g.outcome, stale: false, count: g._count._all })),
    ...staleGroups.map(g => ({ enemyMemberId: g.enemyMemberId, status: 'IN_PROGRESS', outcome: null, stale: true, count: g._count._all })),
    ...freshGroups.map(g => ({ enemyMemberId: g.enemyMemberId, status: 'IN_PROGRESS', outcome: null, stale: false, count: g._count._all })),
  ]
  for (const r of battleRows) entry(r.enemyMemberId).battles.push(r)

  const members = byEnemy.size
    ? await prisma.cMoonEnemyMember.findMany({
        where: { id: { in: [...byEnemy.keys()] } },
        select: { id: true, name: true, isRaidBoss: true, faction: { select: { name: true } } },
      })
    : []
  const memberById = new Map(members.map(m => [m.id, m]))

  const enemies = [...byEnemy.entries()].map(([id, e]) => {
    const m = memberById.get(id)
    const offers = summarizeOffers(e.offers)
    const isRaidBoss = m ? m.isRaidBoss : e.offers.some(o => o.isRaidBoss)
    const o = isRaidBoss ? offers.raid : offers.solo
    return {
      enemyMemberId: id,
      name: m?.name || '(deleted)',
      factionName: m?.faction?.name || null,
      isRaidBoss,
      offered: o.offered,
      accepted: o.accepted,
      startRate: o.startRate,
      solo: summarizeSoloBattles(e.battles),
    }
  }).sort((a, b) => (b.offered - a.offered) || (b.solo.started - a.solo.started) || a.name.localeCompare(b.name))

  return {
    days,
    since: since.toISOString(),
    trackingSince: firstOffer?._min?.offeredAt ? firstOffer._min.offeredAt.toISOString() : null,
    abandonAfterMinutes: ABANDON_AFTER_MINUTES,
    offers: summarizeOffers(offerRows),
    solo: summarizeSoloBattles(battleRows),
    enemies,
  }
})
