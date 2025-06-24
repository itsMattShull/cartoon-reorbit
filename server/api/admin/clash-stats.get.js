// server/api/admin/clash-stats.get.js
import {
  defineEventHandler,
  getRequestHeader,
  createError
} from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1️⃣ Admin auth via /api/auth/me
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  // 2️⃣ Fetch all clash games (we'll group by start date)
  const games = await prisma.clashGame.findMany({
    select: { startedAt: true, endedAt: true }
  })

  // 3️⃣ Build a map of YYYY-MM-DD → { total, finished }
  const statsMap = {}
  for (const g of games) {
    const day = g.startedAt.toISOString().slice(0, 10)
    if (!statsMap[day]) statsMap[day] = { total: 0, finished: 0 }
    statsMap[day].total++
    if (g.endedAt) statsMap[day].finished++
  }

  // 4️⃣ Turn that into a sorted array
  const results = Object.keys(statsMap)
    .sort()
    .map(dayKey => {
      const { total, finished } = statsMap[dayKey]
      return {
        day:             dayKey,
        count:           total,
        percentFinished: total > 0
          ? Math.round((finished / total) * 100)
          : 0
      }
    })

  return results
})
