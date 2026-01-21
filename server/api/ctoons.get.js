import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'

// Fetch on demand; no in-memory cache

async function fetchCToonsFromDB() {
  const now = new Date()
  const fourWeeksAgo = new Date(now)
  const fourWeeksLater = new Date(now)
  fourWeeksAgo.setDate(now.getDate() - 28)
  fourWeeksLater.setDate(now.getDate() + 28)

  // Fetch and sort by releaseDate descending
  const ctoons = await db.ctoon.findMany({
    where: {
      inCmart: true,
      releaseDate: {
        gte: fourWeeksAgo,
        lte: fourWeeksLater
      }
    },
    select: {
      id: true,
      name: true,
      assetPath: true,
      releaseDate: true
    },
    orderBy: {
      releaseDate: 'asc'
    }
  })

  return ctoons
}

export default defineEventHandler(async () => {
  return fetchCToonsFromDB()
})
