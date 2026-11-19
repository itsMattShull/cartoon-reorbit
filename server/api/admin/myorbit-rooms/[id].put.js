import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { parseMyOrbitRoomBody } from '@/server/utils/myOrbitRoom'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const existing = await db.myOrbitRoom.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Room not found' })

  const body = await readBody(event)
  const parsed = parseMyOrbitRoomBody(body, existing)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  let updated
  try {
    updated = await db.myOrbitRoom.update({ where: { id }, data: parsed.data })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'A room with that name already exists' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbitRoom', key: `update:${id}`,
    prevValue: { name: existing.name, gridWidth: existing.gridWidth, gridHeight: existing.gridHeight, capacity: existing.capacity, active: existing.active, themeCMoonId: existing.themeCMoonId, isRaidDen: existing.isRaidDen },
    newValue: { name: updated.name, gridWidth: updated.gridWidth, gridHeight: updated.gridHeight, capacity: updated.capacity, active: updated.active, themeCMoonId: updated.themeCMoonId, isRaidDen: updated.isRaidDen }
  })

  return { id: updated.id }
})
