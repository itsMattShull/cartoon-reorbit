// Flags a player by username. From this point on, server/utils/codeRedemption.js holds any
// code they redeem that awards a cToon instead of resolving it immediately — see
// HandicapRedeemer's own schema comment. The player is never notified.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  if (!username) throw createError({ statusCode: 400, statusMessage: 'A username is required' })
  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 300) : null

  const target = await db.user.findUnique({ where: { username }, select: { id: true, username: true } })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  let created
  try {
    created = await db.handicapRedeemer.create({ data: { userId: target.id, reason, flaggedById: me.id } })
  } catch (err) {
    if (err?.code === 'P2002') throw createError({ statusCode: 409, statusMessage: 'That player is already flagged' })
    throw err
  }

  await logAdminChange(db, {
    userId: me.id, area: 'HandicapRedeems', key: `flag:${target.id}`,
    prevValue: null, newValue: { username: target.username, reason },
    targetUserId: target.id, targetUsername: target.username
  })

  return { id: created.id, userId: target.id, username: target.username, reason, createdAt: created.createdAt }
})
