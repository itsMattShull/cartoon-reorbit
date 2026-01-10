// server/api/game/clash/leaderboard.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { Prisma } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }

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
  const effectiveStart = (startDate && startDate > floorDate) ? startDate : floorDate
  const startedFilter = Prisma.sql`"startedAt" >= ${effectiveStart}`

  // filter by mode
  const modeWhere =
    mode === 'pvp' ? Prisma.sql`"player2UserId" IS NOT NULL` :
    mode === 'pve' ? Prisma.sql`"player2UserId" IS NULL` :
                     Prisma.sql`TRUE`

  // ---------------- existing stats (played / wins / losses / %s) ----------------
  const playedByP1 = await prisma.$queryRaw`
    SELECT "player1UserId" AS uid, COUNT(*)::int AS cnt
    FROM "ClashGame"
    WHERE ${startedFilter} AND ${modeWhere}
    GROUP BY "player1UserId"
  `
  const playedByP2 = mode === 'pve' ? [] : await prisma.$queryRaw`
    SELECT "player2UserId" AS uid, COUNT(*)::int AS cnt
    FROM "ClashGame"
    WHERE ${startedFilter} AND "player2UserId" IS NOT NULL
    GROUP BY "player2UserId"
  `
  const playedRows = []
  for (const r of playedByP1) playedRows.push({ uid: r.uid, played: Number(r.cnt) || 0 })
  for (const r of playedByP2) playedRows.push({ uid: r.uid, played: Number(r.cnt) || 0 })
  const playedTotal = new Map()
  for (const r of playedRows) playedTotal.set(r.uid, (playedTotal.get(r.uid) || 0) + r.played)

  const winRows = await prisma.$queryRaw`
    SELECT "winnerUserId" AS uid, COUNT(*)::int AS wins
    FROM "ClashGame"
    WHERE ${startedFilter} AND ${modeWhere} AND "winnerUserId" IS NOT NULL
    GROUP BY "winnerUserId"
  `
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
  const aiLossRows = mode === 'pvp' ? [] : await prisma.$queryRaw`
    SELECT "player1UserId" AS uid, COUNT(*)::int AS aiLosses
    FROM "ClashGame"
    WHERE ${startedFilter}
      AND "player2UserId" IS NULL
      AND LOWER(outcome) = 'ai'
    GROUP BY "player1UserId"
  `

  const byUser = new Map()
  const ensure = (uid) => {
    if (!uid) return null
    if (!byUser.has(uid)) byUser.set(uid, { played: 0, wins: 0, losses: 0 })
    return byUser.get(uid)
  }
  for (const [uid, p] of playedTotal.entries()) { const row = ensure(uid); if (row) row.played = p }
  for (const r of winRows)    { const row = ensure(r.uid); if (row) row.wins   = Number(r.wins) || 0 }
  for (const r of pvpLossRows){ const row = ensure(r.uid); if (row) row.losses+= Number(r.losses) || 0 }
  for (const r of aiLossRows) { const row = ensure(r.uid); if (row) row.losses+= Number(r.aiLosses) || 0 }

  const rows = []
  for (const [uid, v] of byUser.entries()) {
    const finished = (v.wins || 0) + (v.losses || 0)
    const played   = v.played || 0
    const winPct   = played > 0 ? (v.wins   / played) * 100 : 0
    const lossPct  = played > 0 ? (v.losses / played) * 100 : 0
    rows.push({ uid, played, wins: v.wins || 0, losses: v.losses || 0, finished, winPct, lossPct })
  }
  const desc = (k) => (a, b) => (b[k] - a[k]) || (b.played - a.played) || (b.finished - a.finished)
  const topRows = (arr, k, filterFn = () => true) =>
    arr.filter(filterFn).sort(desc(k)).slice(0, 10)

  const winsTopRows    = topRows(rows, 'wins',    r => r.wins   > 0)
  const playedTopRows  = topRows(rows, 'played',  r => r.played > 0)
  const winPctTopRows  = topRows(rows, 'winPct',  r => r.played >= minFinished)

  // ---------------- 🔹 NEW: Stake Points Earned per user ----------------
  // pick the timestamp to filter on: endedAt if present, else startedAt
  const timeCol = Prisma.sql`COALESCE("endedAt","startedAt")`
  const timeFilter = Prisma.sql`${timeCol} >= ${effectiveStart}`

  // only PvP games can have stakes
  const pvpOnly = Prisma.sql`"player2UserId" IS NOT NULL`

  const earnedTop = await prisma.$queryRaw`
    WITH pvpgames AS (
      SELECT
        "player1UserId",
        "player2UserId",
        "winnerUserId",
        COALESCE(outcome, '') AS outcome,
        "whoLeftUserId",
        COALESCE("player1Points",0) AS p1,
        COALESCE("player2Points",0) AS p2
      FROM "ClashGame"
      WHERE ${timeFilter} AND ${pvpOnly}
    ),
    payouts AS (
      -- Normal wins (non-tie): winner gets pooled stake
      SELECT
        "winnerUserId" AS uid,
        SUM(p1 + p2)::bigint AS earned
      FROM pvpgames
      WHERE "winnerUserId" IS NOT NULL AND outcome <> 'tie'
      GROUP BY "winnerUserId"

      UNION ALL

      -- Ties: each player gets their own stake back
      SELECT "player1UserId" AS uid, SUM(p1)::bigint FROM pvpgames WHERE outcome = 'tie' GROUP BY "player1UserId"
      UNION ALL
      SELECT "player2UserId" AS uid, SUM(p2)::bigint FROM pvpgames WHERE outcome = 'tie' GROUP BY "player2UserId"

      UNION ALL

      -- Incomplete with a leaver: non-leaver gets pooled stake
      SELECT
        CASE WHEN "whoLeftUserId" = "player1UserId" THEN "player2UserId" ELSE "player1UserId" END AS uid,
        SUM(p1 + p2)::bigint AS earned
      FROM pvpgames
      WHERE outcome = 'incomplete' AND "whoLeftUserId" IS NOT NULL
      GROUP BY CASE WHEN "whoLeftUserId" = "player1UserId" THEN "player2UserId" ELSE "player1UserId" END
    )
    SELECT uid, SUM(earned)::bigint AS earned
    FROM payouts
    WHERE uid IS NOT NULL
    GROUP BY uid
    ORDER BY earned DESC
    LIMIT 10
  `
  // resolve usernames (include earned IDs)
  const allIds = Array.from(new Set(
    [...winsTopRows, ...playedTopRows, ...winPctTopRows].map(r => r.uid)
      .concat(earnedTop.map(r => r.uid))
  ))
  const users = allIds.length
    ? await prisma.user.findMany({ where: { id: { in: allIds } }, select: { id: true, username: true } })
    : []
  const nameById = Object.fromEntries(users.map(u => [u.id, u.username || 'Unknown']))

  const mapCount = (arr, key) => arr.map(r => ({ username: nameById[r.uid] || 'Unknown', value: Number(r[key]) || 0 }))
  const mapPct   = (arr, key, numKey) => arr.map(r => ({
    username: nameById[r.uid] || 'Unknown',
    value: r[key],
    num:   r[numKey],
    den:   r.played
  }))

  return {
    timeframe,
    mode,
    minGames: minFinished,
    wins:    mapCount(winsTopRows,   'wins'),
    played:  mapCount(playedTopRows, 'played'),
    winPct:  mapPct(winPctTopRows,   'winPct',  'wins'),

    // 🔹 NEW payload
    earned:  earnedTop.map(r => ({ username: nameById[r.uid] || 'Unknown', value: Number(r.earned) || 0 })),

    // (loss charts removed from client; you can drop them here later if you want)
  }
})
