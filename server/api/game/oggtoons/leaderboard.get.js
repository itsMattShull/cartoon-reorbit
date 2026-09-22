// server/api/game/oggtoons/leaderboard.get.js
// Win/loss/tie record leaderboard for original gToons (2002), computed on the fly over
// OgGtoonMatch — no persisted rating table, same pattern as gToons Clash's leaderboard.
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { Prisma } from '@prisma/client'
import { getOgGtoonsConfig } from '@/server/utils/ogGtoonsConfig'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { leaderboardEnabled } = await getOgGtoonsConfig()
  if (!leaderboardEnabled) {
    throw createError({ statusCode: 403, statusMessage: 'The gToons leaderboard is currently unavailable.' })
  }

  const { timeframe = '1m', minGames = '3' } = getQuery(event)
  const minFinished = Math.max(parseInt(minGames, 10) || 0, 0)

  const now = new Date()
  let startDate = null
  switch (timeframe) {
    case '1w': startDate = new Date(now); startDate.setDate(startDate.getDate() - 7); break
    case '1m': startDate = new Date(now); startDate.setMonth(startDate.getMonth() - 1); break
    case '3m': startDate = new Date(now); startDate.setMonth(startDate.getMonth() - 3); break
    case '6m': startDate = new Date(now); startDate.setMonth(startDate.getMonth() - 6); break
    case '1y': startDate = new Date(now); startDate.setFullYear(startDate.getFullYear() - 1); break
    case 'all':
    default:   startDate = null
  }
  // Uses the @@index([player1UserId, startedAt]) / [player2UserId, startedAt] indexes.
  const startedFilter = startDate ? Prisma.sql`"startedAt" >= ${startDate}` : Prisma.sql`TRUE`

  const playedByP1 = await prisma.$queryRaw`
    SELECT "player1UserId" AS uid, COUNT(*)::int AS cnt
    FROM "OgGtoonMatch"
    WHERE ${startedFilter}
    GROUP BY "player1UserId"
  `
  const playedByP2 = await prisma.$queryRaw`
    SELECT "player2UserId" AS uid, COUNT(*)::int AS cnt
    FROM "OgGtoonMatch"
    WHERE ${startedFilter}
    GROUP BY "player2UserId"
  `
  const playedTotal = new Map()
  for (const r of [...playedByP1, ...playedByP2]) {
    playedTotal.set(r.uid, (playedTotal.get(r.uid) || 0) + (Number(r.cnt) || 0))
  }

  // Uses the @@index([winnerUserId]) index.
  const winRows = await prisma.$queryRaw`
    SELECT "winnerUserId" AS uid, COUNT(*)::int AS wins
    FROM "OgGtoonMatch"
    WHERE ${startedFilter} AND "winnerUserId" IS NOT NULL
    GROUP BY "winnerUserId"
  `
  const lossRows = await prisma.$queryRaw`
    SELECT uid, SUM(cnt)::int AS losses
    FROM (
      SELECT "player1UserId" AS uid, COUNT(*) AS cnt
      FROM "OgGtoonMatch"
      WHERE ${startedFilter} AND "winnerUserId" IS NOT NULL AND "winnerUserId" <> "player1UserId"
      GROUP BY "player1UserId"
      UNION ALL
      SELECT "player2UserId" AS uid, COUNT(*) AS cnt
      FROM "OgGtoonMatch"
      WHERE ${startedFilter} AND "winnerUserId" IS NOT NULL AND "winnerUserId" <> "player2UserId"
      GROUP BY "player2UserId"
    ) x
    GROUP BY uid
  `
  // Uses the @@index([outcome, startedAt]) index.
  const tieRows = await prisma.$queryRaw`
    SELECT uid, SUM(cnt)::int AS ties
    FROM (
      SELECT "player1UserId" AS uid, COUNT(*) AS cnt
      FROM "OgGtoonMatch" WHERE ${startedFilter} AND outcome = 'TIE' GROUP BY "player1UserId"
      UNION ALL
      SELECT "player2UserId" AS uid, COUNT(*) AS cnt
      FROM "OgGtoonMatch" WHERE ${startedFilter} AND outcome = 'TIE' GROUP BY "player2UserId"
    ) x
    GROUP BY uid
  `

  const byUser = new Map()
  const ensure = (uid) => {
    if (!uid) return null
    if (!byUser.has(uid)) byUser.set(uid, { played: 0, wins: 0, losses: 0, ties: 0 })
    return byUser.get(uid)
  }
  for (const [uid, p] of playedTotal.entries()) { const row = ensure(uid); if (row) row.played = p }
  for (const r of winRows)  { const row = ensure(r.uid); if (row) row.wins   = Number(r.wins)   || 0 }
  for (const r of lossRows) { const row = ensure(r.uid); if (row) row.losses = Number(r.losses) || 0 }
  for (const r of tieRows)  { const row = ensure(r.uid); if (row) row.ties   = Number(r.ties)   || 0 }

  const rows = []
  for (const [uid, v] of byUser.entries()) {
    const finished = v.wins + v.losses + v.ties
    const winPct = v.played > 0 ? (v.wins / v.played) * 100 : 0
    rows.push({ uid, played: v.played, wins: v.wins, losses: v.losses, ties: v.ties, finished, winPct })
  }
  const desc = (k) => (a, b) => (b[k] - a[k]) || (b.played - a.played)
  const topRows = (arr, k, filterFn = () => true) => arr.filter(filterFn).sort(desc(k)).slice(0, 10)

  const winsTopRows   = topRows(rows, 'wins',   r => r.wins > 0)
  const playedTopRows = topRows(rows, 'played', r => r.played > 0)
  const winPctTopRows = topRows(rows, 'winPct', r => r.played >= minFinished)

  const allIds = Array.from(new Set([...winsTopRows, ...playedTopRows, ...winPctTopRows].map(r => r.uid)))
  const users = allIds.length
    ? await prisma.user.findMany({ where: { id: { in: allIds } }, select: { id: true, username: true } })
    : []
  const nameById = Object.fromEntries(users.map(u => [u.id, u.username || 'Unknown']))

  return {
    timeframe,
    minGames: minFinished,
    wins:   winsTopRows.map(r => ({ username: nameById[r.uid] || 'Unknown', value: r.wins })),
    played: playedTopRows.map(r => ({ username: nameById[r.uid] || 'Unknown', value: r.played })),
    winPct: winPctTopRows.map(r => ({
      username: nameById[r.uid] || 'Unknown', value: r.winPct, num: r.wins, den: r.played
    }))
  }
})
