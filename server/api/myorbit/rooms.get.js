// The room list for the player client's room switcher — active rooms only, no layout data (the
// socket's own 'join'/'getState' sends that once a room is actually entered). Live occupancy
// isn't included: that's in-memory-only state the socket process owns (see
// server/utils/myOrbitSocket.js's own header comment on why), not something this DB-backed read
// can see.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  if (!event.context.userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const [rooms, me] = await Promise.all([
    db.myOrbitRoom.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true, name: true, gridWidth: true, gridHeight: true, capacity: true, isRaidDen: true,
        theme: { select: { id: true, name: true, color: true, avatarPath: true } }
      }
    }),
    db.user.findUnique({ where: { id: event.context.userId }, select: { cMoonId: true } })
  ])

  return {
    rooms: rooms.map(r => ({
      id: r.id, name: r.name, gridWidth: r.gridWidth, gridHeight: r.gridHeight, capacity: r.capacity,
      isRaidDen: r.isRaidDen,
      theme: r.theme ? { id: r.theme.id, name: r.theme.name, color: r.theme.color, iconPath: r.theme.avatarPath } : null,
      // Purely cosmetic "this is your faction's room" badge — see feature doc "faction war
      // rooms": themed rooms are open to everyone, this just flags the viewer's own turf.
      isHomeTurf: !!(r.theme && me?.cMoonId && r.theme.id === me.cMoonId)
    }))
  }
})
