// server/api/admin/cmoons/[id]/poll.put.js
// Replaces this cMoon's single active poll (CMoon.poll is @unique on cMoonId — at most one at a
// time). "Replace" is delete-then-create in one transaction rather than editing options in
// place, so results never silently mix across unrelated questions — this does mean any existing
// votes are lost, which is the accepted tradeoff of the one-active-poll model.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { invalidatePollResults } from '@/server/utils/cmoon'

const MIN_OPTIONS = 2
const MAX_OPTIONS = 8
const MAX_QUESTION_LEN = 300
const MAX_OPTION_LEN = 120

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const cmoon = await db.cMoon.findUnique({ where: { id }, select: { id: true, poll: { select: { id: true } } } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  const body = await readBody(event)
  const question = typeof body?.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION_LEN) : ''
  const options = Array.isArray(body?.options)
    ? body.options.map(o => (typeof o === 'string' ? o.trim().slice(0, MAX_OPTION_LEN) : '')).filter(Boolean)
    : []

  if (!question) throw createError({ statusCode: 400, statusMessage: 'A poll question is required' })
  if (options.length < MIN_OPTIONS) throw createError({ statusCode: 400, statusMessage: `At least ${MIN_OPTIONS} options are required` })
  if (options.length > MAX_OPTIONS) throw createError({ statusCode: 400, statusMessage: `At most ${MAX_OPTIONS} options are allowed` })

  const oldPollId = cmoon.poll?.id || null

  const poll = await db.$transaction(async (tx) => {
    if (oldPollId) await tx.cMoonPoll.delete({ where: { id: oldPollId } })
    return tx.cMoonPoll.create({
      data: {
        cMoonId: id,
        question,
        options: { create: options.map((label, i) => ({ label, sortOrder: i })) },
      },
      select: { id: true, question: true, options: { select: { id: true, label: true }, orderBy: { sortOrder: 'asc' } } },
    })
  })

  if (oldPollId) invalidatePollResults(oldPollId)

  await logAdminChange(db, { userId: me.id, area: `cMoon:${id}`, key: 'poll', prevValue: oldPollId, newValue: poll.id })

  return { poll }
})
