import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'

// In-memory cache
let cache = null
let lastFetched = 0
const CACHE_DURATION = 1000 * 60 * 60 * 2 // 1 day in ms

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
      createdAt: 'asc'
    }
  })

  return ctoons
}

export default defineEventHandler(async () => {
  const now = Date.now()

  if (!cache || now - lastFetched > CACHE_DURATION) {
    cache = await fetchCToonsFromDB()
    lastFetched = now
  }

  return cache
})
