// server/api/admin/cmoon-riddles.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { broadcastToAllCMoonChannels } from '@/server/utils/cmoonRiddle'

const VALID_KINDS = ['WEEKLY', 'BOSS_LORE']

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const kind = VALID_KINDS.includes(body?.kind) ? body.kind : null
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  const answer = typeof body?.answer === 'string' ? body.answer.trim() : ''
  const enemyMemberId = typeof body?.enemyMemberId === 'string' && body.enemyMemberId ? body.enemyMemberId : null
  const encyclopediaEntryId = typeof body?.encyclopediaEntryId === 'string' && body.encyclopediaEntryId ? body.encyclopediaEntryId : null
  const active = body?.active === undefined ? true : !!body.active

  if (!kind) throw createError({ statusCode: 400, statusMessage: 'Riddle kind is required' })
  if (!question) throw createError({ statusCode: 400, statusMessage: 'Question is required' })
  if (!answer) throw createError({ statusCode: 400, statusMessage: 'Answer is required' })
  // A BOSS_LORE riddle without a boss has nothing to gate; a WEEKLY riddle tied to a boss would
  // be ambiguous about which mechanism (broadcast vs. gate) actually applies — kept mutually
  // exclusive rather than letting one row try to serve both roles at once.
  if (kind === 'BOSS_LORE' && !enemyMemberId) {
    throw createError({ statusCode: 400, statusMessage: 'A boss-lore riddle must be tied to a raid boss' })
  }
  if (kind === 'WEEKLY' && enemyMemberId) {
    throw createError({ statusCode: 400, statusMessage: 'A weekly riddle cannot be tied to a raid boss' })
  }

  let bossName = null
  if (enemyMemberId) {
    const validMember = await db.cMoonEnemyMember.findUnique({ where: { id: enemyMemberId }, select: { id: true, name: true, isRaidBoss: true } })
    if (!validMember || !validMember.isRaidBoss) throw createError({ statusCode: 400, statusMessage: 'Invalid raid boss' })
    bossName = validMember.name
  }
  if (encyclopediaEntryId) {
    const validEntry = await db.encyclopediaEntry.findUnique({ where: { id: encyclopediaEntryId }, select: { id: true } })
    if (!validEntry) throw createError({ statusCode: 400, statusMessage: 'Invalid encyclopedia entry' })
  }

  const created = await db.cMoonRiddle.create({
    data: { kind, question, answer, enemyMemberId, encyclopediaEntryId, active },
  })

  // A BOSS_LORE riddle is event-driven, not scheduled like WEEKLY — the moment it exists active,
  // every team hears about the lock. Fire-and-forget: a failed Discord post must never fail an
  // otherwise-successful riddle creation.
  if (kind === 'BOSS_LORE' && active) {
    broadcastToAllCMoonChannels(db, `🔒 **${bossName}** is locked behind a riddle!\n${question}\n\nAnswer with \`/riddle\` to unlock this raid boss.`).catch(() => {})
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonRiddle', key: `create:${created.id}`, prevValue: null, newValue: { id: created.id, kind: created.kind, question: created.question } })

  return { id: created.id }
})
