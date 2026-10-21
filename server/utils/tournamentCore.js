// server/utils/tournamentCore.js
//
// Pure tournament rules for OG gToons tournaments: Swiss pairing, standings and tiebreaks, bracket
// seeding, best-of-3 series scoring, deadline decisions and final placements. It imports NOTHING
// (no Prisma, no h3), so it loads under bare `node --test` and from the cron, socket and Nuxt
// processes alike. server/utils/ogGtoonTournament.js is the Prisma-bound caller.
//
// Every pairing is a best-of-3: the first player to win 2 games takes the series (BEST_OF).

export const BEST_OF = 3
export const WINS_NEEDED = Math.ceil(BEST_OF / 2)

/** A ready-up must have been standing this long before a walkover can be awarded on it. */
export const WALKOVER_MIN_READY_MS = 15 * 60 * 1000

/** Matches the Clash rule: more than 8 entrants plays Swiss into a Top 8, otherwise a straight bracket. */
export function formatFor(entrants) {
  return entrants <= 8 ? 'BRACKET_8_OR_LESS' : 'SWISS_THEN_TOP8'
}

/** Swiss rounds for a field: about log2(N), never fewer than 3 or more than 6 unless overridden. */
export function swissRoundsFor(entrants, override = null) {
  const o = Number(override)
  if (Number.isInteger(o) && o >= 1) return Math.min(o, 10)
  return Math.min(6, Math.max(3, Math.ceil(Math.log2(Math.max(2, entrants)))))
}

export function pairKey(a, b) {
  return [String(a), String(b)].sort().join(':')
}

/** Highest points first, then opponents' match-win %, then game-win %, then a stable id order. */
export function compareStandings(a, b) {
  return (
    (b.points - a.points) ||
    ((b.opponentMatchWinPct || 0) - (a.opponentMatchWinPct || 0)) ||
    ((b.gameWinPct || 0) - (a.gameWinPct || 0)) ||
    String(a.userId).localeCompare(String(b.userId))
  )
}

/* ── Seeding ─────────────────────────────────────────────────────────────────────────────── */

function hashSeed(str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return (h ^= h >>> 16) >>> 0
  }
}

/** Deterministic PRNG (mulberry32) so a stored seed string always reproduces the same draw. */
export function seededRng(seed) {
  let a = hashSeed(String(seed))()
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates over a copy, driven by the seed. Seeding by sign-up time would reward early/alt accounts. */
export function seededShuffle(items, seed) {
  const rng = seededRng(seed)
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function bracketSizeFor(players) {
  return Math.pow(2, Math.ceil(Math.log2(Math.max(2, players))))
}

/** [1,N],[2,N-1],... — top seeds meet bottom seeds, and byes (missing seeds) go to the top seeds. */
export function buildBracketSeedPairs(bracketSize) {
  const pairs = []
  for (let i = 1; i <= bracketSize / 2; i += 1) pairs.push([i, bracketSize + 1 - i])
  return pairs
}

/** "Final", "Semifinals", "Quarterfinals", "Round of 16" from how many matches the round has. */
export function bracketRoundLabel(matchCount) {
  if (matchCount <= 1) return 'Final'
  if (matchCount === 2) return 'Semifinals'
  if (matchCount === 4) return 'Quarterfinals'
  return `Round of ${matchCount * 2}`
}

/* ── Swiss pairing ───────────────────────────────────────────────────────────────────────── */

/**
 * Pairs one Swiss round.
 *
 * `players` is [{ userId, points, swissByes }] already sorted best-first. `previousPairs` is a Set
 * of pairKey()s. With an odd field the bye goes to the lowest-ranked player who has not had one.
 * Rematches are avoided by backtracking; only if NO rematch-free pairing exists does it allow the
 * fewest rematches it can (reported in `rematches` so the caller can log it).
 */
export function pairSwissRound(players, previousPairs = new Set()) {
  const ids = players.map(p => p.userId)
  let byeUserId = null
  let pool = ids.slice()
  if (pool.length % 2 === 1) {
    for (let i = players.length - 1; i >= 0; i -= 1) {
      if (!players[i].swissByes) { byeUserId = players[i].userId; break }
    }
    if (!byeUserId) byeUserId = players[players.length - 1].userId
    pool = pool.filter(id => id !== byeUserId)
  }

  const search = (remaining, allowedRematches) => {
    if (!remaining.length) return { pairs: [], rematches: 0 }
    const [a, ...rest] = remaining
    // Try partners best-ranked first, rematch-free ones before rematches.
    for (const wantRematch of [false, true]) {
      if (wantRematch && allowedRematches < 1) break
      for (let i = 0; i < rest.length; i += 1) {
        const b = rest[i]
        const isRematch = previousPairs.has(pairKey(a, b))
        if (isRematch !== wantRematch) continue
        const next = rest.filter((_, idx) => idx !== i)
        const sub = search(next, allowedRematches - (isRematch ? 1 : 0))
        if (sub) return { pairs: [[a, b], ...sub.pairs], rematches: sub.rematches + (isRematch ? 1 : 0) }
      }
    }
    return null
  }

  // Bounded work: grow the rematch allowance 0,1,2,... and finally "any".
  const maxAllowance = Math.floor(pool.length / 2)
  for (let allowance = 0; allowance <= maxAllowance; allowance += 1) {
    const found = search(pool, allowance)
    if (found) return { pairs: found.pairs, byeUserId, rematches: found.rematches }
  }
  // Unreachable in practice (allowance == number of pairs always succeeds), but never throw mid-round.
  const pairs = []
  for (let i = 0; i + 1 < pool.length; i += 2) pairs.push([pool[i], pool[i + 1]])
  return { pairs, byeUserId, rematches: pairs.filter(([a, b]) => previousPairs.has(pairKey(a, b))).length }
}

/* ── Series (best-of-3) ──────────────────────────────────────────────────────────────────── */

/**
 * Scores one pairing from its COUNTED games, oldest first. Each game is 'A', 'B' or 'TIE' (a voided
 * game must be filtered out by the caller; it never counts and is replayed).
 *
 * - First to 2 wins takes the series; it ends immediately, with no third game.
 * - After 3 games with nobody on 2, more wins takes it. Level is a draw in Swiss.
 * - A level bracket series plays extra sudden-death games (the first decisive one wins) up to
 *   `maxExtraGames`; past that it needs an admin (`needsAdmin`).
 */
export function computeSeries({ games, stage, requiresWinner = false, maxExtraGames = 4, bestOf = BEST_OF }) {
  const winsNeeded = Math.ceil(bestOf / 2)
  let winsA = 0
  let winsB = 0
  let ties = 0
  let baseCount = 0
  let idx = 0

  while (idx < games.length && baseCount < bestOf && winsA < winsNeeded && winsB < winsNeeded) {
    const g = games[idx]
    if (g === 'A') winsA += 1
    else if (g === 'B') winsB += 1
    else ties += 1
    baseCount += 1
    idx += 1
  }

  let outcome = null
  if (winsA >= winsNeeded) outcome = 'A_WIN'
  else if (winsB >= winsNeeded) outcome = 'B_WIN'
  else if (baseCount >= bestOf) {
    outcome = winsA > winsB ? 'A_WIN' : winsB > winsA ? 'B_WIN' : 'TIE'
  }

  let extraGamesCounted = 0
  let needsAdmin = false
  let needsAdminReason = null
  const mustHaveWinner = stage === 'BRACKET' && requiresWinner

  if (outcome === 'TIE' && mustHaveWinner) {
    for (; idx < games.length && extraGamesCounted < maxExtraGames; idx += 1) {
      const g = games[idx]
      extraGamesCounted += 1
      if (g === 'A') { winsA += 1; outcome = 'A_WIN'; break }
      if (g === 'B') { winsB += 1; outcome = 'B_WIN'; break }
      ties += 1
    }
    if (outcome === 'TIE' && extraGamesCounted >= maxExtraGames) {
      needsAdmin = true
      needsAdminReason = 'Extra games did not produce a winner'
    }
  }

  const decided = outcome === 'A_WIN' || outcome === 'B_WIN' || (outcome === 'TIE' && !mustHaveWinner)
  const gamesCounted = winsA + winsB + ties
  const winnerSide = outcome === 'A_WIN' ? 'A' : outcome === 'B_WIN' ? 'B' : null
  return {
    winsA, winsB, ties, gamesCounted, extraGamesCounted,
    outcome: decided || outcome === 'TIE' ? outcome : null,
    winnerSide,
    decided,
    needsAdmin,
    needsAdminReason,
    // Game number the next game would be (1-based), when the series is still open.
    nextGameNumber: decided ? null : gamesCounted + 1
  }
}

/* ── Deadlines ───────────────────────────────────────────────────────────────────────────── */

/**
 * What to do with a pairing whose deadline has passed. Pure: the caller supplies the facts.
 *
 *   m: { stage, requiresWinner, winsA, winsB, ties, gamesCounted, readyAAt, readyBAt, seedA, seedB }
 *   scoreA/scoreB: aggregate in-game score over the games that WERE played (bracket tiebreak)
 *
 * Returns one of
 *   { kind: 'RESULT', outcome: 'A_WIN'|'B_WIN'|'TIE'|null, resolution, winsA, winsB }
 *       outcome null = both players lose (Swiss double no-show: 0 points each, never a free draw)
 *   { kind: 'NEEDS_ADMIN', reason }
 */
export function decideAtDeadline(m, { now = Date.now(), scoreA = 0, scoreB = 0 } = {}) {
  const t = (v) => (v ? new Date(v).getTime() : null)
  const winsNeeded = WINS_NEEDED
  const isBracket = m.stage === 'BRACKET'

  if ((m.gamesCounted || 0) > 0) {
    if (m.winsA > m.winsB) return { kind: 'RESULT', outcome: 'A_WIN', resolution: 'DEADLINE', winsA: Math.max(m.winsA, winsNeeded), winsB: m.winsB }
    if (m.winsB > m.winsA) return { kind: 'RESULT', outcome: 'B_WIN', resolution: 'DEADLINE', winsA: m.winsA, winsB: Math.max(m.winsB, winsNeeded) }
    if (!isBracket) return { kind: 'RESULT', outcome: 'TIE', resolution: 'DEADLINE', winsA: m.winsA, winsB: m.winsB }
    // Level bracket series: higher aggregate in-game score, then the better (lower-numbered) seed.
    if (scoreA !== scoreB) {
      return scoreA > scoreB
        ? { kind: 'RESULT', outcome: 'A_WIN', resolution: 'DEADLINE', winsA: m.winsA, winsB: m.winsB }
        : { kind: 'RESULT', outcome: 'B_WIN', resolution: 'DEADLINE', winsA: m.winsA, winsB: m.winsB }
    }
    if (m.seedA && m.seedB && m.seedA !== m.seedB) {
      return m.seedA < m.seedB
        ? { kind: 'RESULT', outcome: 'A_WIN', resolution: 'DEADLINE', winsA: m.winsA, winsB: m.winsB }
        : { kind: 'RESULT', outcome: 'B_WIN', resolution: 'DEADLINE', winsA: m.winsA, winsB: m.winsB }
    }
    return { kind: 'NEEDS_ADMIN', reason: 'Level series at the deadline with no tiebreak available' }
  }

  // No game was played. A walkover needs a ready-up that had been standing long enough.
  const showedA = t(m.readyAAt) != null && now - t(m.readyAAt) >= WALKOVER_MIN_READY_MS
  const showedB = t(m.readyBAt) != null && now - t(m.readyBAt) >= WALKOVER_MIN_READY_MS
  if (showedA && !showedB) return { kind: 'RESULT', outcome: 'A_WIN', resolution: 'WALKOVER', winsA: winsNeeded, winsB: 0 }
  if (showedB && !showedA) return { kind: 'RESULT', outcome: 'B_WIN', resolution: 'WALKOVER', winsA: 0, winsB: winsNeeded }
  if (showedA && showedB) return { kind: 'NEEDS_ADMIN', reason: 'Both players were ready but no game was played' }
  if (isBracket) return { kind: 'NEEDS_ADMIN', reason: 'Neither player showed up' }
  return { kind: 'RESULT', outcome: null, resolution: 'DEADLINE', winsA: 0, winsB: 0 }
}

/* ── Records / standings ─────────────────────────────────────────────────────────────────── */

/**
 * Rebuilds every player's record from the finished matches.
 *
 * Swiss points: win 3, draw 1, loss 0, bye 3. A COMPLETE Swiss match with a null outcome is a
 * double loss. Byes are left out of the tiebreaks: opponents' match-win % is each opponent's
 * points over what they earned in real matches, floored at 1/3, and game-win % has the same floor.
 */
export function computeRecords(userIds, swissMatches, bracketMatches) {
  const rec = new Map()
  for (const userId of userIds) {
    rec.set(userId, {
      userId, swissWins: 0, swissLosses: 0, swissTies: 0, swissByes: 0,
      bracketWins: 0, bracketLosses: 0, points: 0,
      swissGameWins: 0, swissGameLosses: 0, swissGameTies: 0,
      opponentMatchWinPct: 0, gameWinPct: 0
    })
  }
  const opponents = new Map()
  const addOpp = (a, b) => {
    if (!opponents.has(a)) opponents.set(a, [])
    opponents.get(a).push(b)
  }

  for (const m of swissMatches) {
    const a = m.playerAUserId
    const b = m.playerBUserId
    const rA = rec.get(a)
    const rB = rec.get(b)
    if (m.status === 'BYE' || a === b) {
      if (rA) { rA.swissByes += 1; rA.points += 3 }
      continue
    }
    if (m.status !== 'COMPLETE') continue
    if (rA && rB) { addOpp(a, b); addOpp(b, a) }
    if (m.outcome === 'A_WIN') {
      if (rA) { rA.swissWins += 1; rA.points += 3 }
      if (rB) rB.swissLosses += 1
    } else if (m.outcome === 'B_WIN') {
      if (rB) { rB.swissWins += 1; rB.points += 3 }
      if (rA) rA.swissLosses += 1
    } else if (m.outcome === 'TIE') {
      if (rA) { rA.swissTies += 1; rA.points += 1 }
      if (rB) { rB.swissTies += 1; rB.points += 1 }
    } else {
      // Double loss (neither player showed up).
      if (rA) rA.swissLosses += 1
      if (rB) rB.swissLosses += 1
    }
    if (rA) { rA.swissGameWins += m.winsA; rA.swissGameLosses += m.winsB; rA.swissGameTies += m.ties }
    if (rB) { rB.swissGameWins += m.winsB; rB.swissGameLosses += m.winsA; rB.swissGameTies += m.ties }
  }

  for (const m of bracketMatches) {
    const a = m.playerAUserId
    const b = m.playerBUserId
    const rA = rec.get(a)
    const rB = rec.get(b)
    if (m.status === 'BYE' || a === b) {
      if (rA) rA.bracketWins += 1
      continue
    }
    if (m.status !== 'COMPLETE') continue
    if (m.winnerUserId === a) {
      if (rA) rA.bracketWins += 1
      if (rB) rB.bracketLosses += 1
    } else if (m.winnerUserId === b) {
      if (rB) rB.bracketWins += 1
      if (rA) rA.bracketLosses += 1
    }
  }

  const FLOOR = 1 / 3
  for (const r of rec.values()) {
    const games = r.swissGameWins + r.swissGameLosses + r.swissGameTies
    r.gameWinPct = games > 0 ? Math.max(FLOOR, (r.swissGameWins + 0.5 * r.swissGameTies) / games) : 0
  }
  for (const r of rec.values()) {
    const opps = opponents.get(r.userId) || []
    if (!opps.length) continue
    let total = 0
    for (const oppId of opps) {
      const o = rec.get(oppId)
      if (!o) continue
      const realMatches = o.swissWins + o.swissLosses + o.swissTies
      const realPoints = o.swissWins * 3 + o.swissTies
      total += realMatches > 0 ? Math.max(FLOOR, realPoints / (realMatches * 3)) : FLOOR
    }
    r.opponentMatchWinPct = total / opps.length
  }
  return rec
}

/* ── Final placements ────────────────────────────────────────────────────────────────────── */

/**
 * Final standings once the bracket is done. `records` is Map|array of player records,
 * `bracketMatches` every finished bracket match. Returns [{ userId, place }] (1 = winner), or []
 * when the final has no winner. Losers rank by the round they went out in (later = better); inside a
 * round, Swiss tournaments use the Swiss standings and brackets use the original seed.
 */
export function buildFinalPlacements({ format, records, bracketMatches }) {
  const recList = records instanceof Map ? Array.from(records.values()) : records
  const recordByUser = new Map(recList.map(r => [r.userId, r]))
  const done = bracketMatches.filter(m => m.status === 'COMPLETE' || m.status === 'BYE')
  if (!done.length) return []

  const finalRound = Math.max(...done.map(m => m.roundNumber))
  const finalMatch = done.find(m => m.roundNumber === finalRound)
  if (!finalMatch || !finalMatch.winnerUserId) return []

  const winnerId = finalMatch.winnerUserId
  const runnerUpId = finalMatch.playerAUserId === winnerId ? finalMatch.playerBUserId : finalMatch.playerAUserId

  const eliminated = new Map()
  const inBracket = new Set()
  const seedByUser = new Map()
  for (const m of done) {
    if (m.playerAUserId) inBracket.add(m.playerAUserId)
    if (m.playerBUserId) inBracket.add(m.playerBUserId)
    if (m.roundNumber === 1) {
      if (m.seedA && m.playerAUserId) seedByUser.set(m.playerAUserId, m.seedA)
      if (m.seedB && m.playerBUserId) seedByUser.set(m.playerBUserId, m.seedB)
    }
    if (m.status === 'BYE' || !m.winnerUserId) continue
    const loser = m.playerAUserId === m.winnerUserId ? m.playerBUserId : m.playerAUserId
    if (loser && !eliminated.has(loser)) eliminated.set(loser, m.roundNumber)
  }

  const rest = Array.from(inBracket).filter(id => id && id !== winnerId && id !== runnerUpId)
  rest.sort((a, b) => {
    const ea = eliminated.get(a) || 0
    const eb = eliminated.get(b) || 0
    if (ea !== eb) return eb - ea
    if (format === 'SWISS_THEN_TOP8') {
      const ra = recordByUser.get(a)
      const rb = recordByUser.get(b)
      if (ra && rb) return compareStandings(ra, rb)
    }
    return (seedByUser.get(a) || 999) - (seedByUser.get(b) || 999)
  })

  const placements = []
  const add = (userId, place) => { if (userId) placements.push({ userId, place }) }
  add(winnerId, 1)
  add(runnerUpId, 2)
  let place = 3
  for (const id of rest) { add(id, place); place += 1 }

  if (format === 'SWISS_THEN_TOP8') {
    const used = new Set(placements.map(p => p.userId))
    const others = recList.filter(r => !used.has(r.userId)).sort(compareStandings)
    for (const r of others) { add(r.userId, place); place += 1 }
  }
  return placements
}

/* ── Prizes ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Who is owed what. FIRST goes to place 1; TOP8 goes to places 2-8 but only when the field had at
 * least `minEntrantsTop8` entrants (otherwise "top 8" would just be everyone but the winner).
 * `eligible` is the set of user ids allowed to be paid (played a real game, not disqualified/banned).
 */
export function prizeRecipients({ placements, entrants, minEntrantsTop8 = 9, eligible = null, hasFirst = true, hasTop8 = true }) {
  const out = []
  for (const p of placements) {
    if (eligible && !eligible.has(p.userId)) continue
    if (p.place === 1 && hasFirst) out.push({ userId: p.userId, place: p.place, tier: 'FIRST' })
    else if (p.place >= 2 && p.place <= 8 && hasTop8 && entrants >= minEntrantsTop8) {
      out.push({ userId: p.userId, place: p.place, tier: 'TOP8' })
    }
  }
  return out
}

/* ── Locked deck ─────────────────────────────────────────────────────────────────────────── */

/**
 * Compares a locked deck snapshot ([{ position, ctoonId, userCtoonId }] x 12) with what the player
 * owns now. `owned` is a Map of userCtoonId -> { userId, ctoonId, burnedAt }. Returns
 * { valid, missing: [position, ...] }.
 */
export function checkLockedDeck(snapshot, userId, owned) {
  const missing = []
  if (!Array.isArray(snapshot) || snapshot.length !== 12) return { valid: false, missing: [] }
  for (const slot of snapshot) {
    const copy = owned.get(slot.userCtoonId)
    const ok = copy && copy.userId === userId && !copy.burnedAt && copy.ctoonId === slot.ctoonId
    if (!ok) missing.push(slot.position)
  }
  return { valid: missing.length === 0, missing }
}

/* ── Time ────────────────────────────────────────────────────────────────────────────────── */

export function roundDueAt(openedAt, hours) {
  return new Date(new Date(openedAt).getTime() + Math.max(1, Number(hours) || 72) * 3600 * 1000)
}
