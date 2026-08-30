// server/api/cmoon/[id]/poll-vote.post.js
// A player votes on this cMoon's active poll. One vote per (poll, user) — enforced by a DB
// unique constraint (CMoonPollVote.@@unique([pollId, userId])), not a pre-read check: the insert
// itself is the guard, exactly like server/utils/cmoon.js's selectCMoonForUser and the dispersal
// claim endpoint this mirrors — a concurrent double-submit just gets the same "already voted"
// error from the second insert's constraint violation, never two rows.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { assertSameOrigin } from '@/server/utils/requireAdmin'
import { invalidatePollResults } from '@/server/utils/cmoon'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  assertSameOrigin(event)

  const cMoonId = event.context.params?.id
  if (!cMoonId) throw createError({ statusCode: 400, statusMessage: 'Missing cMoon id' })

  const body = await readBody(event)
  const optionId = typeof body?.optionId === 'string' ? body.optionId : ''
  if (!optionId) throw createError({ statusCode: 400, statusMessage: 'optionId is required' })

  const [me, poll] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { banned: true, active: true } }),
    db.cMoonPoll.findUnique({ where: { cMoonId }, select: { id: true, options: { select: { id: true } } } }),
  ])
  if (!me || me.banned || me.active === false) throw createError({ statusCode: 403, statusMessage: 'Account not eligible' })
  if (!poll) throw createError({ statusCode: 404, statusMessage: 'This cMoon has no active poll' })

  // Confirms the option actually belongs to THIS poll — without this, a client could pass an
  // optionId from a different cMoon's poll and vote there via this route.
  const option = poll.options.find(o => o.id === optionId)
  if (!option) throw createError({ statusCode: 400, statusMessage: 'Invalid option' })

  try {
    await db.cMoonPollVote.create({ data: { pollId: poll.id, optionId: option.id, userId } })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: "You've already voted in this poll" })
    }
    throw err
  }

  invalidatePollResults(poll.id)

  return { ok: true, optionId: option.id }
})
