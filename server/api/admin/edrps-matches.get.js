// Admin log of Ed, Edd n Eddy RPS matches.
//
// Paginated server-side, unlike the gToons Clash log, which takes a flat 50 and paginates in
// the browser. This table grows far faster than ClashGame, so that would stop working early.
//
// The sameIp / sameVisitorId / response-time columns are the point of this view: two accounts
// trading wins is the obvious way to farm a game this fast, and nothing else in the admin
// tooling looks at game outcomes at all.
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

const PAGE_SIZE = 25

export default defineEventHandler(async (event) => {
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

  const q = getQuery(event)
  const page = Math.max(1, Number.parseInt(q.page, 10) || 1)
  const flaggedOnly = String(q.flagged ?? '') === 'true'
  const username = typeof q.username === 'string' ? q.username.trim() : ''

  const where = {}
  if (flaggedOnly) {
    // "Flagged" means the two sides looked like the same person, or the award was withheld
    // for a reason other than the daily cap simply running out.
    where.OR = [
      { sameIp: true },
      { sameVisitorId: true },
      { suppressReason: { in: ['pair_limit', 'same_device', 'banned'] } }
    ]
  }
  if (username) {
    const nameFilter = { username: { equals: username, mode: 'insensitive' } }
    const matchesName = { OR: [{ player1: nameFilter }, { player2: nameFilter }] }
    where.AND = [...(where.AND || []), matchesName]
  }

  const [total, rows] = await Promise.all([
    prisma.edRpsMatch.count({ where }),
    prisma.edRpsMatch.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        player1Character: true,
        player2Character: true,
        player1Score: true,
        player2Score: true,
        winnerUserId: true,
        whoLeftUserId: true,
        endReason: true,
        rounds: true,
        sameIp: true,
        sameVisitorId: true,
        pointsAwarded: true,
        suppressReason: true,
        player1: { select: { id: true, username: true, discordTag: true } },
        player2: { select: { id: true, username: true, discordTag: true } },
        winner: { select: { username: true } }
      }
    })
  ])

  return {
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    matches: rows.map(m => {
      const rounds = Array.isArray(m.rounds) ? m.rounds : []
      // Surfaced as a median rather than the raw list: scripted win-trading throws in tens of
      // milliseconds with almost no variance, and that is legible at a glance in a table.
      const times = rounds
        .flatMap(r => [r?.p1Ms, r?.p2Ms])
        .filter(n => typeof n === 'number' && n >= 0)
        .sort((a, b) => a - b)
      const medianMs = times.length ? times[Math.floor(times.length / 2)] : null
      const autoThrows = rounds.filter(r => r?.p1Auto || r?.p2Auto).length

      return {
        id: m.id,
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        player1: m.player1,
        player2: m.player2,
        player1Character: m.player1Character,
        player2Character: m.player2Character,
        score: `${m.player1Score}–${m.player2Score}`,
        winner: m.winner?.username ?? null,
        winnerUserId: m.winnerUserId,
        whoLeftUserId: m.whoLeftUserId,
        endReason: m.endReason,
        roundCount: rounds.length,
        medianResponseMs: medianMs,
        autoThrows,
        sameIp: m.sameIp,
        sameVisitorId: m.sameVisitorId,
        pointsAwarded: m.pointsAwarded,
        suppressReason: m.suppressReason
      }
    })
  }
})
