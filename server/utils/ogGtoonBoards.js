// server/utils/ogGtoonBoards.js
//
// The pure half of the OG gToons Leaderboard + Meta tabs: query-string normalisation, cache keys,
// and turning aggregate rows into the API response. It imports NOTHING (no Prisma, no Nuxt), so the
// API routes and node:test can both load it; the SQL that produces the rows is in ogGtoonBoardsSql.js.
//
// One set of rules for every number on both tabs:
//   • Only FINISHED games count: INCOMPLETE (stale sweeps, admin-voided tournament games) never does, and
//     neither does a timed-out game saved as a 0-0 tie — nobody played it.
//   • Win % = (wins + ½·ties) / games, where games = wins + losses + ties.
//   • Leaderboard: a forfeit counts (the player who left takes the loss). Meta: forfeits are skipped,
//     because the decks never really played.

export const CACHE_VERSION = 'v3'
// The boards are read-mostly standings, so an hour-old answer is fine and keeps the heavy scans rare.
export const CACHE_TTL_SEC = 3600

export const TIMEFRAMES = ['1w', '1m', '3m', '6m', '1y', 'all']
export const BOARD_MODES = ['human', 'practice']
export const HUMAN_FILTERS = ['all', 'non_tournament', 'tournament']
export const PRACTICE_DIFFICULTIES = ['all', 'easy', 'normal', 'hard']
export const PRACTICE_MIN_GAMES = 10 // quitting a practice match isn't recorded, so a tiny sample proves little
export const BOARD_SIZE = 10

export const META_DAYS = [7, 14, 30, 60, 90]
export const META_FILTERS = HUMAN_FILTERS
export const META_SORTS = ['winPct', 'wins', 'games']
export const META_MIN_DECK_GAMES = 2 // decks seen fewer times are not stored at all (they would be most of the table)
export const META_CARD_ROWS = 200

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

/** (wins + ½·ties) / games × 100; 0 when nothing was played. */
export function winPct(wins, ties, games) {
  return games > 0 ? ((wins + ties * 0.5) / games) * 100 : 0
}

/** Start of a timeframe, or null for all time. */
export function timeframeStart(timeframe, now = new Date()) {
  const d = new Date(now)
  switch (timeframe) {
    case '1w': d.setDate(d.getDate() - 7); return d
    case '1m': d.setMonth(d.getMonth() - 1); return d
    case '3m': d.setMonth(d.getMonth() - 3); return d
    case '6m': d.setMonth(d.getMonth() - 6); return d
    case '1y': d.setFullYear(d.getFullYear() - 1); return d
    default: return null
  }
}

/* ── Leaderboard ─────────────────────────────────────────────────────────────────────────── */

/**
 * Every value is whitelisted, so the result is safe to put in a cache key and a SQL fragment choice.
 * `filter` only means something for human matches and `difficulty` only for practice; the other is
 * pinned to 'all' so a stale value can never fragment the cache.
 */
export function normalizeLeaderboardParams(query = {}) {
  const mode = pick(query.mode, BOARD_MODES, 'human')
  const timeframe = pick(query.timeframe, TIMEFRAMES, '1m')
  const filter = mode === 'human' ? pick(query.filter, HUMAN_FILTERS, 'all') : 'all'
  const difficulty = mode === 'practice' ? pick(query.difficulty, PRACTICE_DIFFICULTIES, 'all') : 'all'
  let minGames = Math.min(Math.max(int(query.minGames, 3), 0), 100)
  if (mode === 'practice') minGames = Math.max(minGames, PRACTICE_MIN_GAMES)
  return { mode, timeframe, filter, difficulty, minGames }
}

/** The cache holds the aggregate for these three only; minGames is applied afterwards. */
export function leaderboardCacheKey({ mode, timeframe, filter, difficulty }) {
  return `og-leaderboard:${CACHE_VERSION}:${mode}:${mode === 'human' ? filter : difficulty}:${timeframe}`
}

/** Whether the Stake Points Earned board applies (stakes only exist in human matches, never in tournaments). */
export function showsEarned({ mode, filter }) {
  return mode === 'human' && filter !== 'tournament'
}

const rowOut = (r, value) => ({
  username: r.username || 'Unknown',
  value,
  wins: r.wins,
  losses: r.losses,
  ties: r.ties,
  played: r.played,
  // How the wins were decided (more goal-colour cards vs. higher points); forfeits and older games are in neither.
  winsByColor: r.winsByColor,
  winsByPoints: r.winsByPoints
})

const byName = (a, b) => String(a.username || '').localeCompare(String(b.username || ''))

/**
 * @param rows  [{ uid, username, played, wins, losses, ties, winsByColor, winsByPoints, earned }] — one per player, already
 *              limited to the cached (mode, filter/difficulty, timeframe). played = wins + losses + ties.
 */
export function buildLeaderboard(rows, params, generatedAt = new Date()) {
  const list = (Array.isArray(rows) ? rows : []).map(r => ({
    uid: r.uid,
    username: r.username,
    played: Number(r.played) || 0,
    wins: Number(r.wins) || 0,
    losses: Number(r.losses) || 0,
    ties: Number(r.ties) || 0,
    winsByColor: Number(r.winsByColor) || 0,
    winsByPoints: Number(r.winsByPoints) || 0,
    earned: Number(r.earned) || 0
  }))
  const top = (arr, cmp) => arr.sort((a, b) => cmp(a, b) || byName(a, b)).slice(0, BOARD_SIZE)

  const wins = top(list.filter(r => r.wins > 0), (a, b) => (b.wins - a.wins) || (b.played - a.played))
    .map(r => rowOut(r, r.wins))
  const played = top(list.filter(r => r.played > 0), (a, b) => (b.played - a.played) || (b.wins - a.wins))
    .map(r => rowOut(r, r.played))
  const pct = list.filter(r => r.played >= Math.max(params.minGames, 1)).map(r => ({ ...r, pct: winPct(r.wins, r.ties, r.played) }))
  const winPctRows = top(pct, (a, b) => (b.pct - a.pct) || (b.played - a.played) || (b.wins - a.wins))
    .map(r => rowOut(r, r.pct))

  const out = {
    mode: params.mode,
    timeframe: params.timeframe,
    filter: params.filter,
    difficulty: params.difficulty,
    minGames: params.minGames,
    generatedAt: new Date(generatedAt).toISOString(),
    wins,
    played,
    winPct: winPctRows
  }
  if (showsEarned(params)) {
    out.earned = top(list.filter(r => r.earned > 0), (a, b) => (b.earned - a.earned) || (b.wins - a.wins))
      .map(r => rowOut(r, r.earned))
  }
  return out
}

/* ── Meta ────────────────────────────────────────────────────────────────────────────────── */

export function normalizeMetaParams(query = {}) {
  return {
    days: pick(int(query.days, 30), META_DAYS, 30),
    filter: pick(query.filter, META_FILTERS, 'all'),
    sort: pick(query.sort, META_SORTS, 'winPct'),
    minGames: Math.min(Math.max(int(query.minGames, 3), META_MIN_DECK_GAMES), 100),
    limit: Math.min(Math.max(int(query.limit, 25), 5), 100)
  }
}

/** The cache holds the aggregate for these two only; sort / minGames / limit are applied afterwards. */
export function metaCacheKey({ days, filter }) {
  return `og-meta:${CACHE_VERSION}:${filter}:${days}`
}

/** A deck has no name in OG gToons, so it is labelled by its usual bottom (goal) card. */
export function deckLabel(goalCard) {
  return goalCard?.name ? `Goal: ${goalCard.name}` : 'Unnamed deck'
}

const num = (v) => Number(v) || 0

/**
 * @param cached {
 *   totalGames, decidedGames, generatedAt,
 *   decks: [{ deckId, deckKey, goalCtoonId, games, wins, losses, ties, mirrors }],
 *   cards: [{ ctoonId, name, assetPath, color, value, isSlam, appearances, wins, losses, ties }]
 * }
 *   decks.games counts a mirror match (both players on the same 12 cards) once; the win/loss/tie
 *   counts leave mirrors out, so a mirror cannot drag a deck toward 50 %.
 */
export function buildMetaResponse(cached, params) {
  const cards = (cached?.cards || []).map(c => ({
    ctoonId: c.ctoonId,
    name: c.name || 'Unknown',
    assetPath: c.assetPath || null,
    color: c.color || null,
    value: c.value == null ? null : num(c.value),
    isSlam: !!c.isSlam,
    appearances: num(c.appearances),
    wins: num(c.wins),
    losses: num(c.losses),
    ties: num(c.ties)
  }))
  const cardById = new Map(cards.map(c => [c.ctoonId, c]))
  const totalGames = num(cached?.totalGames)
  const decidedGames = num(cached?.decidedGames)
  const deckAppearances = totalGames * 2

  const decks = (cached?.decks || [])
    .map(d => {
      const rated = num(d.wins) + num(d.losses) + num(d.ties)
      return {
        deckId: d.deckId,
        deckName: deckLabel(cardById.get(d.goalCtoonId)),
        goalCtoonId: d.goalCtoonId || null,
        cardIds: String(d.deckKey || '').split(',').filter(Boolean),
        games: num(d.games),
        wins: num(d.wins),
        losses: num(d.losses),
        ties: num(d.ties),
        mirrors: num(d.mirrors),
        winPct: winPct(num(d.wins), num(d.ties), rated),
        sharePct: totalGames > 0 ? (num(d.games) / totalGames) * 100 : 0
      }
    })
    .filter(d => d.games >= params.minGames)

  const sorters = {
    winPct: (a, b) => (b.winPct - a.winPct) || (b.wins - a.wins) || (b.games - a.games),
    wins: (a, b) => (b.wins - a.wins) || (b.winPct - a.winPct) || (b.games - a.games),
    games: (a, b) => (b.games - a.games) || (b.winPct - a.winPct) || (b.wins - a.wins)
  }
  const sortedDecks = decks.sort(sorters[params.sort]).slice(0, params.limit)

  const cardUsage = cards
    .filter(c => c.appearances > 0)
    .map(c => ({
      ...c,
      usePct: deckAppearances > 0 ? (c.appearances / deckAppearances) * 100 : 0,
      winPct: winPct(c.wins, c.ties, c.appearances)
    }))
    .sort((a, b) => (b.appearances - a.appearances) || (b.winPct - a.winPct) || String(a.name).localeCompare(String(b.name)))
    .slice(0, META_CARD_ROWS)

  const winningCards = cards
    .filter(c => c.wins > 0)
    .map(c => ({
      ctoonId: c.ctoonId,
      name: c.name,
      color: c.color,
      value: c.value,
      wins: c.wins,
      winSharePct: decidedGames > 0 ? (c.wins / decidedGames) * 100 : 0
    }))
    .sort((a, b) => (b.wins - a.wins) || String(a.name).localeCompare(String(b.name)))
    .slice(0, 10)

  // One dictionary for everything the page draws, so a card used by many decks is sent once.
  const needed = new Set()
  for (const d of sortedDecks) for (const id of d.cardIds) needed.add(id)
  for (const d of sortedDecks) if (d.goalCtoonId) needed.add(d.goalCtoonId)
  const dictionary = {}
  for (const id of needed) {
    const c = cardById.get(id)
    if (c) dictionary[id] = { name: c.name, assetPath: c.assetPath, color: c.color, value: c.value, isSlam: c.isSlam }
  }

  return {
    days: params.days,
    filter: params.filter,
    sort: params.sort,
    minGames: params.minGames,
    generatedAt: cached?.generatedAt || null,
    totalGames,
    decidedGames,
    totalDecks: decks.length,
    decks: sortedDecks,
    cards: dictionary,
    cardUsage,
    winningCards
  }
}
