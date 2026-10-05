// server/api/admin/cmoon-riddles/[id].put.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { broadcastToAllCMoonChannels } from '@/server/utils/cmoonRiddle'

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

  // A BOSS_LORE riddle re-activated (e.g. an admin staged it inactive, then flips it on) gets the
  // same teaser broadcast a fresh creation would — the rising edge, not every save, so editing an
  // already-active or already-inactive riddle's wording doesn't re-announce it. Fire-and-forget:
  // a failed Discord post must never fail an otherwise-successful save.
  if (riddle.kind === 'BOSS_LORE' && active && !riddle.active) {
    db.cMoonEnemyMember.findUnique({ where: { id: riddle.enemyMemberId }, select: { name: true } }).then(member => {
      broadcastToAllCMoonChannels(db, `🔒 **${member?.name || 'A raid boss'}** is locked behind a riddle!\n${question}\n\nAnswer with \`/riddle\` to unlock this raid boss.`)
    }).catch(() => {})
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonRiddle', key: `update:${id}`, prevValue: { question: riddle.question, active: riddle.active }, newValue: { question, active } })

  return { ok: true }
})
