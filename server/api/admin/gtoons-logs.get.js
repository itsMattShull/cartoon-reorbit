// server/api/admin/gtoons-logs.get.js

import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Admin check
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

  // 2) Query params: pagination + optional timeframe
  const { offset = '0', limit = '1000', timeframe } = getQuery(event)
  const skip = Math.max(parseInt(offset, 10) || 0, 0)
  const take = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500)

  // Optional timeframe filter (none by default)
  let startedAtFilter = undefined
  if (typeof timeframe === 'string' && timeframe) {
    const now = new Date()
    const start = new Date(now)
    switch (timeframe) {
      case '1m': start.setMonth(start.getMonth() - 1); break
      case '3m': start.setMonth(start.getMonth() - 3); break
      case '6m': start.setMonth(start.getMonth() - 6); break
      case '1y': start.setFullYear(start.getFullYear() - 1); break
      default:   // ignore unknown timeframe (no filter)
        break
    }
    if (start.getTime() !== now.getTime()) {
      startedAtFilter = { gte: start }
    }
  }

  // 3) Fetch games
  const games = await prisma.clashGame.findMany({
    where: {
      ...(startedAtFilter ? { startedAt: startedAtFilter } : {})
    },
    orderBy: { startedAt: 'desc' },
    skip,
    take,
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      outcome: true,          // 'player' | 'ai' | 'tie' | 'incomplete' | null
      player1: { select: { id: true, username: true } },
      player2: { select: { id: true, username: true } }, // null => AI
      winner:  { select: { id: true, username: true } }, // null => AI win / tie / incomplete
      whoLeft:  { select: { id: true, username: true } }
    }
  })

  // 4) Return in the shape the Vue page expects
  return { games }
})
