// server/api/game/clash/leaderboard.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { Prisma } from '@prisma/client'

export default defineEventHandler(async (event) => {
  // auth (same as before)
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }

  // timeframe + minGames + mode
  const { timeframe = '1m', minGames = '3', mode = 'all' } = getQuery(event)
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

  const floorDate = new Date('2025-08-10T05:00:00Z')

  // If timeframe would start earlier (or is 'all'), use the floor instead
  const effectiveStart = (startDate && startDate > floorDate) ? startDate : floorDate

  const startedFilter = Prisma.sql`"startedAt" >= ${effectiveStart}`

  // mode filter helper
  const modeWhere =
    mode === 'pvp' ? Prisma.sql`"player2UserId" IS NOT NULL` :
    mode === 'pve' ? Prisma.sql`"player2UserId" IS NULL` :
                     Prisma.sql`TRUE`

  // -------- Played per user --------
  // arm A: counts by player1 (exists in both PvE & PvP; filter with modeWhere)
  const playedByP1 = await prisma.$queryRaw`
    SELECT "player1UserId" AS uid, COUNT(*)::int AS cnt
    FROM "ClashGame"
    WHERE ${startedFilter} AND ${modeWhere}
    GROUP BY "player1UserId"
  `

  // arm B: counts by player2 (only meaningful for PvP)
  const playedByP2 = mode === 'pve' ? [] : await prisma.$queryRaw`
    SELECT "player2UserId" AS uid, COUNT(*)::int AS cnt
    FROM "ClashGame"
    WHERE ${startedFilter} AND "player2UserId" IS NOT NULL
      ${mode === 'pvp' ? Prisma.sql`` : Prisma.sql``} -- (kept readable; already restricted by NOT NULL)
    GROUP BY "player2UserId"
  `

  // merge played rows
  const playedRows = []
  for (const r of playedByP1) playedRows.push({ uid: r.uid, played: Number(r.cnt) || 0 })
  for (const r of playedByP2) playedRows.push({ uid: r.uid, played: Number(r.cnt) || 0 })
  // fold to total played per uid
  const playedTotal = new Map()
  for (const r of playedRows) {
    playedTotal.set(r.uid, (playedTotal.get(r.uid) || 0) + r.played)
  }

  // -------- Wins per user (winnerUserId) --------
  const winRows = await prisma.$queryRaw`
    SELECT "winnerUserId" AS uid, COUNT(*)::int AS wins
    FROM "ClashGame"
    WHERE ${startedFilter} AND ${modeWhere} AND "winnerUserId" IS NOT NULL
    GROUP BY "winnerUserId"
  `

  // -------- Losses per user --------
  // PvP losses (only when mode !== 'pve')
  const pvpLossRows = mode === 'pve' ? [] : await prisma.$queryRaw`
    SELECT uid, SUM(cnt)::int AS losses
    FROM (
      SELECT "player1UserId" AS uid, COUNT(*) AS cnt
      FROM "ClashGame"
      WHERE ${startedFilter}
        AND "player1UserId" IS NOT NULL
        AND "player2UserId" IS NOT NULL
        AND "winnerUserId"  IS NOT NULL
        AND "winnerUserId" <> "player1UserId"
      GROUP BY "player1UserId"
      UNION ALL
      SELECT "player2UserId" AS uid, COUNT(*) AS cnt
      FROM "ClashGame"
      WHERE ${startedFilter}
        AND "player2UserId" IS NOT NULL
        AND "winnerUserId"  IS NOT NULL
        AND "winnerUserId" <> "player2UserId"
      GROUP BY "player2UserId"
    ) x
    GROUP BY uid
  `

  // PvE AI losses (only when mode !== 'pvp')
  const aiLossRows = mode === 'pvp' ? [] : await prisma.$queryRaw`
    SELECT "player1UserId" AS uid, COUNT(*)::int AS aiLosses
    FROM "ClashGame"
    WHERE ${startedFilter}
      AND "player2UserId" IS NULL
      AND LOWER(outcome) = 'ai'
    GROUP BY "player1UserId"
  `

  // -------- Combine per user --------
  const byUser = new Map() // uid -> { played, wins, losses }
  const ensure = (uid) => {
    if (!uid) return null
    if (!byUser.has(uid)) byUser.set(uid, { played: 0, wins: 0, losses: 0 })
    return byUser.get(uid)
  }

  for (const [uid, p] of playedTotal.entries()) { const row = ensure(uid); if (row) row.played = p }
  for (const r of winRows)    { const row = ensure(r.uid); if (row) row.wins   = Number(r.wins) || 0 }
  for (const r of pvpLossRows){ const row = ensure(r.uid); if (row) row.losses+= Number(r.losses) || 0 }
  for (const r of aiLossRows) { const row = ensure(r.uid); if (row) row.losses+= Number(r.aiLosses) || 0 }

  // derive finished + %s
  const rows = []
  for (const [uid, v] of byUser.entries()) {
    const finished = (v.wins || 0) + (v.losses || 0) // ties/incomplete excluded
    const winPct   = finished > 0 ? (v.wins   / finished) * 100 : 0
    const lossPct  = finished > 0 ? (v.losses / finished) * 100 : 0
    rows.push({ uid, played: v.played || 0, wins: v.wins || 0, losses: v.losses || 0, finished, winPct, lossPct })
  }

  // rank helpers
  const desc = (k) => (a, b) => (b[k] - a[k]) || (b.played - a.played) || (b.finished - a.finished)
  const topRows = (arr, k, filterFn = () => true) =>
    arr.filter(filterFn).sort(desc(k)).slice(0, 10)

  const winsTopRows    = topRows(rows, 'wins',    r => r.wins   > 0)
  const lossesTopRows  = topRows(rows, 'losses',  r => r.losses > 0)
  const playedTopRows  = topRows(rows, 'played',  r => r.played > 0)
  const winPctTopRows  = topRows(rows, 'winPct',  r => r.finished >= minFinished)
  const lossPctTopRows = topRows(rows, 'lossPct', r => r.finished >= minFinished)

  // resolve usernames
  const allIds = Array.from(new Set(
    [...winsTopRows, ...lossesTopRows, ...playedTopRows, ...winPctTopRows, ...lossPctTopRows].map(r => r.uid)
  ))
  const users = allIds.length
    ? await prisma.user.findMany({ where: { id: { in: allIds } }, select: { id: true, username: true } })
    : []
  const nameById = Object.fromEntries(users.map(u => [u.id, u.username || 'Unknown']))

  // shape outputs (percent rows carry num/den for your card)
  const mapCount = (arr, key) => arr.map(r => ({ username: nameById[r.uid] || 'Unknown', value: r[key] }))
  const mapPct   = (arr, key, numKey) => arr.map(r => ({
    username: nameById[r.uid] || 'Unknown',
    value: r[key],
    num:   r[numKey],
    den:   r.finished
  }))

  return {
    timeframe,
    mode,
    minGames: minFinished,
    wins:    mapCount(winsTopRows,   'wins'),
    losses:  mapCount(lossesTopRows, 'losses'),
    played:  mapCount(playedTopRows, 'played'),
    winPct:  mapPct(winPctTopRows,   'winPct',  'wins'),
    lossPct: mapPct(lossPctTopRows,  'lossPct', 'losses')
  }
})
