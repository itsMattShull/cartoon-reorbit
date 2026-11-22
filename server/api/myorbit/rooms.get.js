// The room list for the player client's room switcher — active rooms only, no layout data (the
// socket's own 'join'/'getState' sends that once a room is actually entered). Live occupancy
// (onlineCount) comes from the Redis presence mirror in server/utils/myOrbitPresence.js, NOT
// from this DB-backed read's own query — the socket process that actually tracks who's in which
// room is a separate process from this one (see that file's own header for why a small Redis
// mirror is the bridge rather than this endpoint somehow reaching into socket-server.js).
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { roomOccupancyCounts } from '@/server/utils/myOrbitPresence'

export default defineEventHandler(async (event) => {
  if (!event.context.userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const [rooms, me, occupancy] = await Promise.all([
    db.myOrbitRoom.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true, name: true, gridWidth: true, gridHeight: true, capacity: true, isRaidDen: true,
        showLeaderboard: true,
        theme: { select: { id: true, name: true, color: true, avatarPath: true } }
      }
    }),
    db.user.findUnique({ where: { id: event.context.userId }, select: { cMoonId: true } }),
    roomOccupancyCounts().catch(() => new Map()) // Redis hiccup should never break the room list itself
  ])

  return {
    rooms: rooms.map(r => ({
      id: r.id, name: r.name, gridWidth: r.gridWidth, gridHeight: r.gridHeight, capacity: r.capacity,
      isRaidDen: r.isRaidDen,
      showLeaderboard: r.showLeaderboard,
      theme: r.theme ? { id: r.theme.id, name: r.theme.name, color: r.theme.color, iconPath: r.theme.avatarPath } : null,
      // Purely cosmetic "this is your faction's room" badge — see feature doc "faction war
      // rooms": themed rooms are open to everyone, this just flags the viewer's own turf.
      isHomeTurf: !!(r.theme && me?.cMoonId && r.theme.id === me.cMoonId),
      onlineCount: occupancy.get(r.id) || 0
    }))
  }
})
