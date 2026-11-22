// Everyone this player follows in MyOrbit, with live online/room status layered on top of the
// same Redis presence mirror online.get.js reads — this is the "my list" view, distinct from
// that endpoint's "everyone online right now" view. A followed player who's currently offline
// still shows up here with online:false and no roomId - that's the whole point of following
// someone who isn't online right now, so you can tell when they come back.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { listOnlinePresence } from '@/server/utils/myOrbitPresence'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const follows = await db.myOrbitFollow.findMany({
    where: { followerId: userId },
    select: { followed: { select: { id: true, username: true } } },
    orderBy: { createdAt: 'desc' }
  })
  if (!follows.length) return { users: [] }

  const presenceByUserId = new Map((await listOnlinePresence()).map(p => [p.userId, p]))
  return {
    users: follows.map(f => {
      const presence = presenceByUserId.get(f.followed.id)
      return { userId: f.followed.id, username: f.followed.username, online: !!presence, roomId: presence?.roomId || null }
    })
  }
})
