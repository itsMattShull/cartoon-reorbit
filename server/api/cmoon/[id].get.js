// server/api/cmoon/[id].get.js
// Public cMoon team profile page data (no auth required — matches the rest of the cMoon/
// leaderboard endpoints, e.g. server/api/cmoons.get.js and server/api/leaderboard/*.get.js).
// Cached briefly in Redis: this is a per-cMoon page any visitor can load, and none of its
// fields (score, member list, prize cToons) need millisecond freshness.
//
// IMPORTANT: uses an explicit `select` rather than including the raw CMoon relation, so an
// admin-only field like discordRoleId can never leak here just because it exists on the model.
import { defineEventHandler, createError, getRouterParam } from 'h3'
import { prisma as db } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { getGlobalConfig } from '@/server/utils/cmoon'
import { EXCLUDED_SYSTEM_USER_ID } from '@/server/utils/economyValuation'

const TTL_SECONDS = 30
const TOP_MEMBERS_LIMIT = 20

export default defineEventHandler(async (event) => {
  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) throw createError({ statusCode: 404, statusMessage: 'cMoons are not enabled' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing cMoon id' })

  const cacheKey = `cmoon:page:${id}`
  try {
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)
  } catch {}

  const cmoon = await db.cMoon.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      color: true,
      memberCount: true,
      teamScore: true,
      captains: { select: { user: { select: { username: true } } } },
      prizeCtoons: { select: { quantity: true, ctoon: { select: { name: true, assetPath: true } } } },
    },
  })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  const [rankRows, topMembers] = await Promise.all([
    db.cMoon.count({ where: { teamScore: { gt: cmoon.teamScore } } }),
    db.user.findMany({
      where: { cMoonId: id, active: true, banned: false, id: { not: EXCLUDED_SYSTEM_USER_ID } },
      orderBy: { points: { points: 'desc' } },
      take: TOP_MEMBERS_LIMIT,
      select: { username: true, avatar: true, points: { select: { points: true } } },
    }),
  ])

  const payload = {
    id: cmoon.id,
    name: cmoon.name,
    color: cmoon.color,
    memberCount: cmoon.memberCount,
    teamScore: cmoon.teamScore,
    rank: rankRows + 1,
    captains: cmoon.captains.map(cap => cap.user?.username).filter(Boolean),
    prizeCtoons: cmoon.prizeCtoons.map(pc => ({ name: pc.ctoon?.name || '', assetPath: pc.ctoon?.assetPath || null, quantity: pc.quantity })),
    topMembers: topMembers.map(u => ({ username: u.username, avatar: u.avatar, points: u.points?.points || 0 })),
  }

  try { await redis.set(cacheKey, JSON.stringify(payload), 'EX', TTL_SECONDS) } catch {}
  return payload
})
