import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { parseMyOrbitRoomBody } from '@/server/utils/myOrbitRoom'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = parseMyOrbitRoomBody(body)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  let created
  try {
    created = await db.myOrbitRoom.create({ data: parsed.data })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'A room with that name already exists' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbitRoom', key: `create:${created.id}`,
    prevValue: null, newValue: { id: created.id, name: created.name }
  })

  return { id: created.id }
})
