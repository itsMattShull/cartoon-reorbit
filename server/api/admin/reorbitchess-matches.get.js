// Admin log of ReOrbit Chess games.
//
// Paginated server-side, like the Ed, Edd n Eddy RPS log it is modelled on.
//
// The sameIp / sameVisitorId / move-time columns are the point of this view. Nothing else in
// the admin tooling looks at game outcomes, and chess has a farming route the other games do
// not: a game can be thrown deliberately in a couple of moves. The ply count and the median
// move time are what make that legible — a genuine game has variable think times and lasts
// tens of moves; a traded one is fast, short and metronomic.
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
    // for a reason other than the daily cap simply running out. 'too_short' is included
    // because a run of them between the same pair is exactly what deliberate throwing looks
    // like.
    where.OR = [
      { sameIp: true },
      { sameVisitorId: true },
      { suppressReason: { in: ['pair_limit', 'same_device', 'banned', 'too_short'] } }
    ]
  }
  if (username) {
    const nameFilter = { username: { equals: username, mode: 'insensitive' } }
    const matchesName = { OR: [{ white: nameFilter }, { black: nameFilter }] }
    where.AND = [...(where.AND || []), matchesName]
  }

  const [total, rows] = await Promise.all([
    prisma.reOrbitChessMatch.count({ where }),
    prisma.reOrbitChessMatch.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        result: true,
        winnerUserId: true,
        whoLeftUserId: true,
        endReason: true,
        plies: true,
        moves: true,
        finalFen: true,
        initialSeconds: true,
        incrementSeconds: true,
        whiteMsLeft: true,
        blackMsLeft: true,
        sameIp: true,
        sameVisitorId: true,
        pointsAwarded: true,
        suppressReason: true,
        white: { select: { id: true, username: true, discordTag: true } },
        black: { select: { id: true, username: true, discordTag: true } },
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
      // moves is [[san, ms], ...]. Surfaced as a median rather than the raw list: a scripted
      // exchange moves in tens of milliseconds with almost no variance, which is legible at a
      // glance in a table where the full move list would not be.
      const moves = Array.isArray(m.moves) ? m.moves : []
      const times = moves
        .map(e => Array.isArray(e) ? e[1] : null)
        .filter(n => typeof n === 'number' && n >= 0)
        .sort((a, b) => a - b)
      const medianMs = times.length ? times[Math.floor(times.length / 2)] : null

      return {
        id: m.id,
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        white: m.white,
        black: m.black,
        result: m.result,
        winner: m.winner?.username ?? null,
        winnerUserId: m.winnerUserId,
        whoLeftUserId: m.whoLeftUserId,
        endReason: m.endReason,
        plies: m.plies,
        timeControl: `${Math.round(m.initialSeconds / 60)}+${m.incrementSeconds}`,
        medianMoveMs: medianMs,
        whiteMsLeft: m.whiteMsLeft,
        blackMsLeft: m.blackMsLeft,
        sameIp: m.sameIp,
        sameVisitorId: m.sameVisitorId,
        pointsAwarded: m.pointsAwarded,
        suppressReason: m.suppressReason,
        finalFen: m.finalFen
      }
    })
  }
})
