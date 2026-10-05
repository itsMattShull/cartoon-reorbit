// server/api/admin/cmoon-riddles/[id].put.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const riddle = await db.cMoonRiddle.findUnique({ where: { id } })
  if (!riddle) throw createError({ statusCode: 404, statusMessage: 'Riddle not found' })

  const body = await readBody(event)
  const question = body?.question === undefined ? riddle.question : (typeof body.question === 'string' ? body.question.trim() : '')
  const answer = body?.answer === undefined ? riddle.answer : (typeof body.answer === 'string' ? body.answer.trim() : '')
  const encyclopediaEntryId = body?.encyclopediaEntryId === undefined
    ? riddle.encyclopediaEntryId
    : (typeof body.encyclopediaEntryId === 'string' && body.encyclopediaEntryId ? body.encyclopediaEntryId : null)
  const active = body?.active === undefined ? riddle.active : !!body.active
  // kind and enemyMemberId are immutable after creation — switching a riddle between WEEKLY and
  // BOSS_LORE, or re-pointing a BOSS_LORE riddle at a different boss, changes what it gates in a
  // way that's easy to get half-right; an admin who wants that recreates the riddle instead.

  if (!question) throw createError({ statusCode: 400, statusMessage: 'Question is required' })
  if (!answer) throw createError({ statusCode: 400, statusMessage: 'Answer is required' })
  if (encyclopediaEntryId) {
    const validEntry = await db.encyclopediaEntry.findUnique({ where: { id: encyclopediaEntryId }, select: { id: true } })
    if (!validEntry) throw createError({ statusCode: 400, statusMessage: 'Invalid encyclopedia entry' })
  }

  await db.cMoonRiddle.update({ where: { id }, data: { question, answer, encyclopediaEntryId, active } })

  await logAdminChange(db, { userId: me.id, area: 'CMoonRiddle', key: `update:${id}`, prevValue: { question: riddle.question, active: riddle.active }, newValue: { question, active } })

  return { ok: true }
})
