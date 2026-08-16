// server/utils/duelMatchLog.js
//
// Paginated admin match log shared by the duel games. Both tables have the same columns —
// server/utils/duelRuntime.js writes both — so this is the query, and each game's endpoint
// supplies the delegate and any name resolution of its own.
//
// The point of this view is the collusion signals. Two accounts trading wins is the cheapest
// way to farm a game this fast, and nothing else in the admin tooling looks at game outcomes
// at all. Response times are the one signal a VPN and a fresh fingerprint cannot launder.
//
// Paginated server-side, unlike the gToons Clash log which takes a flat 50 and pages in the
// browser: these tables grow far faster than ClashGame, so that stops working early.
const PAGE_SIZE = 25

export async function listDuelMatches(delegate, q = {}) {
  const page = Math.max(1, Number.parseInt(q.page, 10) || 1)
  const flaggedOnly = String(q.flagged ?? '') === 'true'
  const username = typeof q.username === 'string' ? q.username.trim() : ''

  const where = {}
  if (flaggedOnly) {
    // "Flagged" means the two sides looked like the same person, or the award was withheld for
    // a reason other than the daily cap simply running out.
    where.OR = [
      { sameIp: true },
      { sameVisitorId: true },
      { suppressReason: { in: ['pair_limit', 'same_device', 'banned', 'self_match'] } }
    ]
  }
  if (username) {
    const nameFilter = { username: { equals: username, mode: 'insensitive' } }
    where.AND = [...(where.AND || []), { OR: [{ player1: nameFilter }, { player2: nameFilter }] }]
  }

  const [total, rows] = await Promise.all([
    delegate.count({ where }),
    delegate.findMany({
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

      return {
        id: m.id,
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        player1: m.player1,
        player2: m.player2,
        player1Character: m.player1Character,
        player2Character: m.player2Character,
        score: `${m.player1Score}-${m.player2Score}`,
        winner: m.winner?.username ?? null,
        winnerUserId: m.winnerUserId,
        whoLeftUserId: m.whoLeftUserId,
        endReason: m.endReason,
        roundCount: rounds.length,
        medianResponseMs: medianMs,
        autoThrows: rounds.filter(r => r?.p1Auto || r?.p2Auto).length,
        sameIp: m.sameIp,
        sameVisitorId: m.sameVisitorId,
        pointsAwarded: m.pointsAwarded,
        suppressReason: m.suppressReason
      }
    })
  }
}
