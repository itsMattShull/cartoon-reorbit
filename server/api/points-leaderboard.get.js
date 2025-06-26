// server/api/leaderboard/points.get.js


import { defineEventHandler } from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // fetch the top 10 non-admin users by points
  const top10 = await prisma.userPoints.findMany({
    where: {
      userId: {
        not: '4f0e8b3b-7d0b-466b-99e7-8996c91d7eb3'
      }
    },
    orderBy: { points: 'desc' },
    take: 10,
    include: {
      user: {
        select: {
          username: true
        }
      }
    }
  })

  // map to a simple array
  return top10.map(({ user: { username }, points }) => ({
    username,
    points
  }))
})
