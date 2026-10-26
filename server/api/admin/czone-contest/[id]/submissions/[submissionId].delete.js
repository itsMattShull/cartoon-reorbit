// DELETE /api/admin/czone-contest/[id]/submissions/[submissionId] — remove a submission while submissions/voting are still open
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { id, submissionId } = event.context.params
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const submission = await prisma.cZoneContestSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      contestId: true,
      contest: { select: { endDate: true, endVotingDate: true, distributedAt: true } }
    }
  })
  if (!submission || submission.contestId !== id) {
    throw createError({ statusCode: 404, statusMessage: 'Submission not found' })
  }

  const { endDate, endVotingDate, distributedAt } = submission.contest
  const closesAt = endVotingDate || endDate
  if (distributedAt || new Date() > closesAt) {
    throw createError({ statusCode: 400, statusMessage: 'Submissions and voting have ended for this contest' })
  }

  // Votes cascade via DB constraint
  await prisma.cZoneContestSubmission.delete({ where: { id: submissionId } })

  return { ok: true }
})
