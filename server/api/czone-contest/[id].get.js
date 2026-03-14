// GET /api/czone-contest/[id] — contest detail with shuffled submissions and caller's votes
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default defineEventHandler(async (event) => {
  const { id } = event.context.params

  const contest = await prisma.cZoneContest.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      maxVotesPerUser: true,
      distributedAt: true,
      winnerId: true,
      submissions: {
        select: {
          id: true,
          userId: true,
          zoneIndex: true,
          imageUrl: true,
          createdAt: true,
          _count: { select: { votes: true } }
        }
      }
    }
  })

  if (!contest) throw createError({ statusCode: 404, statusMessage: 'Contest not found' })

  // Determine caller identity (optional — logged-in users see their own submission and votes)
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me = null
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {}

  let myVotedSubmissionIds = new Set()
  let mySubmissionId = null

  if (me?.id) {
    const myVotes = await prisma.cZoneContestVote.findMany({
      where: { userId: me.id, submission: { contestId: id } },
      select: { submissionId: true }
    })
    myVotedSubmissionIds = new Set(myVotes.map(v => v.submissionId))

    const mySub = contest.submissions.find(s => s.userId === me.id)
    if (mySub) mySubmissionId = mySub.id
  }

  const submissions = shuffle(
    contest.submissions.map(s => ({
      id: s.id,
      imageUrl: s.imageUrl,
      voteCount: s._count.votes,
      isOwn: s.id === mySubmissionId,
      hasVoted: myVotedSubmissionIds.has(s.id)
    }))
  )

  const votesUsed = myVotedSubmissionIds.size

  return {
    id: contest.id,
    name: contest.name,
    startDate: contest.startDate,
    endDate: contest.endDate,
    maxVotesPerUser: contest.maxVotesPerUser,
    distributedAt: contest.distributedAt,
    winnerId: contest.winnerId,
    submissions,
    votesUsed,
    votesRemaining: me ? contest.maxVotesPerUser - votesUsed : 0
  }
})
