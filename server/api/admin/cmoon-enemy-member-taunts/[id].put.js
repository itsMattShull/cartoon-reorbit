// server/api/admin/cmoon-enemy-member-taunts/[id].put.js — edit a member taunt's text/active/
// sortOrder. Mirrors cmoon-enemy-taunts/[id].put.js exactly (its faction-wide sibling) — `trigger`
// is locked at create time (see parseTauntBody's own comment on why), and a previously-uploaded
// soundPath is never touched by this endpoint.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseTauntBody } from '@/server/utils/cmoonEnemy'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const taunt = await db.cMoonEnemyMemberTaunt.findUnique({ where: { id } })
  if (!taunt) throw createError({ statusCode: 404, statusMessage: 'Taunt not found' })

  const body = await readBody(event)
  const parsed = parseTauntBody(body, taunt)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }

  await db.cMoonEnemyMemberTaunt.update({ where: { id }, data: parsed.data })

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyMemberTaunt',
    key: `update:${id}`,
    prevValue: { text: taunt.text, active: taunt.active, sortOrder: taunt.sortOrder },
    newValue: parsed.data,
  })

  return { ok: true }
})
