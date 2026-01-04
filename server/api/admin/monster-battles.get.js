// server/api/admin/monster-battles.get.js
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
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden - Admins only' })
  }

  const q = getQuery(event)
  const page = Math.max(parseInt(q.page || '1', 10), 1)
  const limit = 100
  const skip = (page - 1) * limit
  const username = typeof q.username === 'string' ? q.username.trim() : ''
  const from = q.from ? parseStartYMD(String(q.from)) : null
  const to = q.to ? parseEndYMD(String(q.to)) : null

  const where = {
    ...(username
      ? { player1: { username: { contains: username, mode: 'insensitive' } } }
      : {}),
    ...(from || to
      ? {
          startedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {})
          }
        }
      : {})
  }

  const [total, battles] = await Promise.all([
    prisma.monsterBattle.count({ where }),
    prisma.monsterBattle.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        endReason: true,
        winnerUserId: true,
        winnerIsAi: true,
        player2IsAi: true,
        player2StartStats: true,
        player1: { select: { id: true, username: true, discordTag: true } },
        player1Monster: { select: { id: true, name: true, customName: true } }
      }
    })
  ])

  const items = battles.map(b => ({
    id: b.id,
    startedAt: b.startedAt,
    endedAt: b.endedAt,
    endReason: b.endReason,
    winnerUserId: b.winnerUserId,
    winnerIsAi: b.winnerIsAi,
    player2IsAi: b.player2IsAi,
    player: b.player1,
    playerMonster: b.player1Monster,
    aiMonsterName: b.player2IsAi ? (b.player2StartStats?.name || null) : null
  }))

  return { items, total, page, limit }
})
