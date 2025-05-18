// server/api/leaderboard/points.get.js

import { PrismaClient } from '@prisma/client'
import { defineEventHandler } from 'h3'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  // fetch the top 10 non-admin users by points
  const top10 = await prisma.userPoints.findMany({
    where: {
      user: {
        isAdmin: false
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
