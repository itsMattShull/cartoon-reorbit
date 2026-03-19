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
      endVotingDate: true,
      maxVotesPerUser: true,
      distributedAt: true,
      winnerId: true,
      winnerPrizes: true,
      participantPrizes: true,
      submissions: {
        select: {
          id: true,
          userId: true,
          zoneIndex: true,
          imageUrl: true,
          createdAt: true,
          _count: { select: { votes: true } },
          user: { select: { username: true } }
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
      hasVoted: myVotedSubmissionIds.has(s.id),
      username: s.user?.username ?? null
    }))
  )

  const votesUsed = myVotedSubmissionIds.size

  // Resolve background IDs to image details for prize display
  const allBgIds = [
    ...((contest.winnerPrizes?.backgroundIds) || []),
    ...((contest.participantPrizes?.backgroundIds) || [])
  ]
  let bgMap = {}
  if (allBgIds.length) {
    const bgs = await prisma.background.findMany({
      where: { id: { in: allBgIds } },
      select: { id: true, label: true, imagePath: true }
    })
    bgMap = Object.fromEntries(bgs.map(b => [b.id, b]))
  }

  function resolvePrize(prize) {
    if (!prize) return { ctoons: [], backgrounds: [], points: 0 }
    return {
      ctoons: prize.ctoons || [],
      backgrounds: (prize.backgroundIds || []).map(id => bgMap[id] || { id, label: id, imagePath: null }),
      points: prize.points || 0
    }
  }

  return {
    id: contest.id,
    name: contest.name,
    startDate: contest.startDate,
    endDate: contest.endDate,
    endVotingDate: contest.endVotingDate,
    maxVotesPerUser: contest.maxVotesPerUser,
    distributedAt: contest.distributedAt,
    winnerId: contest.winnerId,
    winnerPrizes: resolvePrize(contest.winnerPrizes),
    participantPrizes: resolvePrize(contest.participantPrizes),
    submissions,
    votesUsed,
    votesRemaining: me ? contest.maxVotesPerUser - votesUsed : 0
  }
})
