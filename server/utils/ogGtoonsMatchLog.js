// server/utils/ogGtoonsMatchLog.js
//
// Paginated admin log of OG gToons PvP games: who played whom, who won, the points each side
// staked and the final score. Every finished game is one OgGtoonMatch row, written once by
// persistAndSettle in server/utils/ogGtoonsSocket.js (and by the tournament runner), so the log
// covers every game since the table existed. Practice games vs. the bot live in
// OgGtoonPracticeMatch, stake nothing, and are deliberately not listed here.
//
// Kept free of Nuxt/Nitro imports so tests/ogGtoonsMatchLog.test.js can drive it with a fake
// delegate. The endpoint is server/api/admin/og-gtoons-logs.get.js.

export const OG_GTOONS_LOG_PAGE_SIZE = 50

const YMD = /^\d{4}-\d{2}-\d{2}$/

function dayStart (ymd) {
  if (typeof ymd !== 'string' || !YMD.test(ymd)) return null
  const d = new Date(`${ymd}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function dayEnd (ymd) {
  if (typeof ymd !== 'string' || !YMD.test(ymd)) return null
  const d = new Date(`${ymd}T23:59:59.999Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** The Prisma `where` for a query string: username (either player, exact, any case) + date range. */
export function buildOgGtoonsLogWhere (q = {}) {
  const where = {}
  const username = typeof q.username === 'string' ? q.username.trim() : ''
  if (username) {
    const nameFilter = { username: { equals: username, mode: 'insensitive' } }
    where.OR = [{ player1: nameFilter }, { player2: nameFilter }]
  }
  let fromYmd = q.from
  let toYmd = q.to
  // Swapped inputs: treat them as the range the admin obviously meant.
  if (dayStart(fromYmd) && dayStart(toYmd) && dayStart(fromYmd) > dayStart(toYmd)) {
    [fromYmd, toYmd] = [toYmd, fromYmd]
  }
  const from = dayStart(fromYmd)
  const to = dayEnd(toYmd)
  if (from || to) {
    where.startedAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
  }
  return where
}

/** How the game ended, in words an admin reads at a glance. */
export function describeOgGtoonsResult (m) {
  if (m.outcome === 'TIE') return 'Tie'
  if (m.outcome === 'INCOMPLETE' || !m.outcome) return 'Incomplete'
  if (m.whoLeft?.username || m.whoLeftUserId) {
    return `Forfeit (${m.whoLeft?.username || 'a player'} left)`
  }
  if (m.winReason === 'COLOR') return 'Won on color'
  if (m.winReason === 'POINTS') return 'Won on points'
  return 'Won'
}

function winnerName (m) {
  if (m.outcome === 'PLAYER1') return m.player1?.username ?? m.winner?.username ?? null
  if (m.outcome === 'PLAYER2') return m.player2?.username ?? m.winner?.username ?? null
  return m.winner?.username ?? null
}

export async function listOgGtoonMatches (delegate, q = {}) {
  const page = Math.max(1, Number.parseInt(q.page, 10) || 1)
  const where = buildOgGtoonsLogWhere(q)

  const [total, rows] = await Promise.all([
    delegate.count({ where }),
    delegate.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * OG_GTOONS_LOG_PAGE_SIZE,
      take: OG_GTOONS_LOG_PAGE_SIZE,
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        player1Points: true,
        player2Points: true,
        player1Score: true,
        player2Score: true,
        outcome: true,
        winReason: true,
        isChallenge: true,
        tournamentMatchId: true,
        whoLeftUserId: true,
        player1: { select: { id: true, username: true } },
        player2: { select: { id: true, username: true } },
        winner: { select: { id: true, username: true } },
        whoLeft: { select: { id: true, username: true } }
      }
    })
  ])

  return {
    page,
    pageSize: OG_GTOONS_LOG_PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / OG_GTOONS_LOG_PAGE_SIZE)),
    matches: rows.map(m => {
      const s1 = m.player1Points || 0
      const s2 = m.player2Points || 0
      return {
        id: m.id,
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        player1: m.player1,
        player2: m.player2,
        winner: winnerName(m),
        outcome: m.outcome,
        result: describeOgGtoonsResult(m),
        // Each side stakes the same amount (the smaller of the two offers); the winner takes the
        // pot and a tie refunds both. Both are kept in case that ever changes.
        player1Staked: s1,
        player2Staked: s2,
        pot: s1 + s2,
        player1Score: m.player1Score,
        player2Score: m.player2Score,
        score: `${m.player1Score}-${m.player2Score}`,
        type: m.tournamentMatchId ? 'Tournament' : (m.isChallenge ? 'Challenge' : 'Queue')
      }
    })
  }
}
