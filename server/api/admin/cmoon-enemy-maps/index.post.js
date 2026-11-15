// server/api/admin/cmoon-enemy-maps/index.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseEnemyMapBody } from '@/server/utils/cmoonEnemyMap'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = parseEnemyMapBody(body)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  // isBaseMap is never settable through this endpoint — only this feature's own seed migration
  // ever creates that one row (see CMoonEnemyMap.isBaseMap's own schema comment).
  let created
  try {
    created = await db.cMoonEnemyMap.create({ data: parsed.data })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'A map with that name already exists' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonEnemyMap', key: `create:${created.id}`, prevValue: null, newValue: { id: created.id, name: parsed.data.name } })

  return { id: created.id }
})
