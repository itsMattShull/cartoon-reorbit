// server/api/admin/clash-games.get.js
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

  // 2️⃣ Fetch recent clash games, include usernames and discord tags
  const games = await prisma.clashGame.findMany({
    orderBy: { startedAt: 'desc' },
    take: 50,
    include: {
      player1: { select: { username: true, discordTag: true } },
      player2: { select: { username: true, discordTag: true } },
      winner:  { select: { username: true, discordTag: true } }
    }
  })

  // 3️⃣ Shape the payload
  return games.map(g => ({
    id:           g.id,
    startedAt:    g.startedAt,
    endedAt:      g.endedAt,
    player1:      g.player1,
    player2:      g.player2,        // null for AI
    winner:       g.winner,         // null if AI/tie
    winnerUserId: g.winnerUserId,
    outcome: g.outcome
  }))
})
