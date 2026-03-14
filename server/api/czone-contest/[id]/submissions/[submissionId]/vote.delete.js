// DELETE /api/czone-contest/[id]/submissions/[submissionId]/vote — remove a vote
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { id, submissionId } = event.context.params

  // Auth check
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me = null
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {}
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // Verify contest is still active (can only unvote during active contest)
  const now = new Date()
  const contest = await prisma.cZoneContest.findUnique({
    where: { id },
    select: { id: true, startDate: true, endDate: true, distributedAt: true, maxVotesPerUser: true }
  })
  if (!contest) throw createError({ statusCode: 404, statusMessage: 'Contest not found' })
  if (contest.distributedAt) throw createError({ statusCode: 400, statusMessage: 'Contest has ended' })
  if (now < contest.startDate || now > contest.endDate) throw createError({ statusCode: 400, statusMessage: 'Contest is not active' })

  const vote = await prisma.cZoneContestVote.findUnique({
    where: { submissionId_userId: { submissionId, userId: me.id } }
  })
  if (!vote) throw createError({ statusCode: 404, statusMessage: 'Vote not found' })

  await prisma.cZoneContestVote.delete({
    where: { submissionId_userId: { submissionId, userId: me.id } }
  })

  const usedVotes = await prisma.cZoneContestVote.count({
    where: { userId: me.id, submission: { contestId: id } }
  })

  return { ok: true, votesRemaining: contest.maxVotesPerUser - usedVotes }
})
