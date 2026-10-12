// server/api/admin/cmoon-enemy-taunts/[id].put.js — edit a taunt's text/active/sortOrder.
// `trigger` is locked at create time (see parseTauntBody's own comment on why) — only the fields
// parseTauntBody actually returns for an update (text, active, sortOrder) ever change here, so a
// previously-uploaded soundPath is never touched by this endpoint.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseTauntBody } from '@/server/utils/cmoonEnemy'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const taunt = await db.cMoonEnemyTaunt.findUnique({ where: { id } })
  if (!taunt) throw createError({ statusCode: 404, statusMessage: 'Taunt not found' })

  const body = await readBody(event)
  const parsed = parseTauntBody(body, taunt)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }

  await db.cMoonEnemyTaunt.update({ where: { id }, data: parsed.data })

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyTaunt',
    key: `update:${id}`,
    prevValue: { text: taunt.text, active: taunt.active, sortOrder: taunt.sortOrder },
    newValue: parsed.data,
  })

  return { ok: true }
})
