// server/api/admin/czone-effects/[id].put.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseCZoneEffectBody } from '@/server/utils/czoneEffect'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const effect = await db.cZoneEffect.findUnique({ where: { id } })
  if (!effect) throw createError({ statusCode: 404, statusMessage: 'cZone effect not found' })

  const body = await readBody(event)
  const parsed = parseCZoneEffectBody(body, effect)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }

  try {
    await db.cZoneEffect.update({ where: { id }, data: parsed.data })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'A cZone effect with that name already exists' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CZoneEffect', key: `update:${id}`, prevValue: { name: effect.name }, newValue: { name: parsed.data.name } })

  return { ok: true }
})
