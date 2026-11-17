// The room list for the player client's room switcher — active rooms only, no layout data (the
// socket's own 'join'/'getState' sends that once a room is actually entered). Live occupancy
// isn't included: that's in-memory-only state the socket process owns (see
// server/utils/myOrbitSocket.js's own header comment on why), not something this DB-backed read
// can see.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  if (!event.context.userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const rooms = await db.myOrbitRoom.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, gridWidth: true, gridHeight: true, capacity: true }
  })
  return { rooms }
})
