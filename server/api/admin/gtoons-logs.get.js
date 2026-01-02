// server/api/admin/gtoons-logs.get.js

import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

function parseStartYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T00:00:00.000Z`)
  return isNaN(d.getTime()) ? null : d
}

function parseEndYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T23:59:59.999Z`)
  return isNaN(d.getTime()) ? null : d
}

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

  // 2) Query params: pagination + optional timeframe or date range
  const q = getQuery(event)
  const page = Math.max(parseInt(q.page || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(q.limit || '100', 10), 1), 200)
  const skip = (page - 1) * limit

  // Optional timeframe filter (none by default)
  let startedAtFilter = undefined
  if (typeof q.timeframe === 'string' && q.timeframe) {
    const now = new Date()
    const start = new Date(now)
    switch (q.timeframe) {
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

  const from = q.from ? parseStartYMD(String(q.from)) : null
  const to = q.to ? parseEndYMD(String(q.to)) : null

  const where = {
    ...(startedAtFilter ? { startedAt: startedAtFilter } : {}),
    ...(from || to
      ? {
          startedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {})
          }
        }
      : {})
  }

  // 3) Fetch games
  const [total, games] = await Promise.all([
    prisma.clashGame.count({ where }),
    prisma.clashGame.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip,
      take: limit,
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
  ])

  // 4) Return in the shape the Vue page expects
  return { items: games, total, page, limit }
})
