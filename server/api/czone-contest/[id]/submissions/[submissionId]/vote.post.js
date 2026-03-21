// POST /api/czone-contest/[id]/submissions/[submissionId]/vote — cast a vote
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { id, submissionId } = event.context.params

  // Auth check
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me = null
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {}
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // Verify voting is open
  const now = new Date()
  const contest = await prisma.cZoneContest.findUnique({
    where: { id },
    select: { id: true, startDate: true, endDate: true, endVotingDate: true, distributedAt: true, maxVotesPerUser: true }
  })
  if (!contest) throw createError({ statusCode: 404, statusMessage: 'Contest not found' })
  if (contest.distributedAt) throw createError({ statusCode: 400, statusMessage: 'Contest has ended' })

  if (contest.endVotingDate) {
    // Separate voting phase: voting opens at submission end and closes at voting end
    if (now < contest.endDate) throw createError({ statusCode: 400, statusMessage: 'Voting has not opened yet — submissions are still being accepted' })
    if (now > contest.endVotingDate) throw createError({ statusCode: 400, statusMessage: 'Voting has closed' })
  } else {
    // No separate voting date: voting allowed during submission window
    if (now < contest.startDate || now > contest.endDate) throw createError({ statusCode: 400, statusMessage: 'Contest is not active' })
  }

  // Verify submission belongs to this contest
  const submission = await prisma.cZoneContestSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, contestId: true, userId: true }
  })
  if (!submission || submission.contestId !== id) throw createError({ statusCode: 404, statusMessage: 'Submission not found' })

  // No self-voting
  if (submission.userId === me.id) throw createError({ statusCode: 400, statusMessage: 'You cannot vote on your own submission' })

  // Check vote limit
  const usedVotes = await prisma.cZoneContestVote.count({
    where: { userId: me.id, submission: { contestId: id } }
  })
  if (usedVotes >= contest.maxVotesPerUser) {
    throw createError({ statusCode: 400, statusMessage: `You have used all ${contest.maxVotesPerUser} of your votes for this contest` })
  }

  // Check already voted on this submission
  const existing = await prisma.cZoneContestVote.findUnique({
    where: { submissionId_userId: { submissionId, userId: me.id } }
  })
  if (existing) throw createError({ statusCode: 400, statusMessage: 'You already voted on this submission' })

  await prisma.cZoneContestVote.create({ data: { submissionId, userId: me.id } })

  return { ok: true, votesRemaining: contest.maxVotesPerUser - usedVotes - 1 }
})
