// server/api/admin/cmoon-enemy-factions/[id].put.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseFactionBody } from '@/server/utils/cmoonEnemy'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const faction = await db.cMoonEnemyFaction.findUnique({ where: { id } })
  if (!faction) throw createError({ statusCode: 404, statusMessage: 'Enemy faction not found' })

  const body = await readBody(event)
  const parsed = parseFactionBody(body, faction)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }

  try {
    await db.cMoonEnemyFaction.update({ where: { id }, data: parsed.data })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'An enemy faction with that name already exists' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyFaction',
    key: `update:${id}`,
    prevValue: { name: faction.name, active: faction.active, sortOrder: faction.sortOrder },
    newValue: { name: parsed.data.name, active: parsed.data.active, sortOrder: parsed.data.sortOrder },
  })

  return { ok: true }
})
