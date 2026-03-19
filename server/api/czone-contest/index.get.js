// GET /api/czone-contest — list active (non-distributed) contests
import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async () => {
  const now = new Date()
  // Show contests that are still active: either in submission phase or in voting-only phase
  const contests = await prisma.cZoneContest.findMany({
    where: {
      startDate: { lte: now },
      distributedAt: null,
      OR: [
        // No separate voting date: contest ends at endDate
        { endVotingDate: null, endDate: { gte: now } },
        // Has separate voting date: contest ends at endVotingDate
        { endVotingDate: { gte: now } }
      ]
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      endVotingDate: true,
      maxVotesPerUser: true
    },
    orderBy: { endDate: 'asc' }
  })
  return contests
})
