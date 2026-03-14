// GET /api/czone-contest — list active (non-distributed) contests
import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async () => {
  const now = new Date()
  const contests = await prisma.cZoneContest.findMany({
    where: {
      startDate: { lte: now },
      endDate: { gte: now },
      distributedAt: null
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      maxVotesPerUser: true
    },
    orderBy: { endDate: 'asc' }
  })
  return contests
})
