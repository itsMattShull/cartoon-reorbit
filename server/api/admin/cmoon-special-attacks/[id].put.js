// server/api/admin/cmoon-special-attacks/[id].put.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseSpecialAttackBody } from '@/server/utils/cmoonEnemy'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const attack = await db.cMoonSpecialAttack.findUnique({ where: { id } })
  if (!attack) throw createError({ statusCode: 404, statusMessage: 'Special attack not found' })

  const body = await readBody(event)
  const parsed = parseSpecialAttackBody(body, attack)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  try {
    await db.cMoonSpecialAttack.update({ where: { id }, data: parsed.data })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'A special attack with that name already exists' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonSpecialAttack', key: `update:${id}`, prevValue: { name: attack.name }, newValue: { name: parsed.data.name } })

  return { ok: true }
})
