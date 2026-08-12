// ReOrbit Chess — shared rules, cast and tuning.
//
// Imported by BOTH the browser (pages/newsite/reorbitchess.vue and the AI web worker) and the
// server (server/utils/reorbitChessRuntime.js, the sole authority for anything played for
// points). It lives in lib/ for the same reason lib/edRps.js does: one copy, so the two sides
// cannot drift.
//
// There are no secrets in here. Chess is a perfect-information game — there is nothing to hide
// from a client except the opponent's clock arithmetic, which the server owns. Everything here
// is public rules and presentation.
//
// What is NOT here: move generation and legality. That is chess.js, used by both sides. A
// hand-rolled ruleset would be the single most exploitable thing in a points-paying game.

/* ── Tuning ──────────────────────────────────────────────────────────────────────────────
 * Mirrored by GameConfig's reorbitChess* columns. The server clamps to these ranges on read,
 * so a bad admin value can never break a live match. server/api/admin/game-config.post.js
 * rejects out-of-range values as well, so an admin sees an error rather than silently saving
 * something the game ignores. */
export const CONFIG_LIMITS = {
  // 1 minute to 30 minutes a side. The floor is not arbitrary: below ~60s the flag timer
  // fires inside the round-trip a phone on mobile data needs to deliver a move.
  initialSeconds: { min: 60, max: 1800, default: 300 },
  // Increment is what makes a clocked game survivable on a phone. 0 is allowed, but see the
  // note on MIN_INCREMENT_FOR_MOBILE below.
  incrementSeconds: { min: 0, max: 30, default: 3 },
  pairDailyAwardLimit: { min: 0, max: 50, default: 2 },
  // Anti-farm floor. A chess game can be thrown in two moves, so a decisive result shorter
  // than this pays nothing. Ten moves each is long enough that throwing costs more time than
  // the points are worth, and short enough that a genuine miniature still pays.
  minPliesForAward: { min: 0, max: 80, default: 20 },
  // How long a disconnected player has to come back before forfeiting. Longer than the RPS
  // game's 20s because a chess match spans several minutes of a commute.
  graceSeconds: { min: 10, max: 180, default: 45 }
}

export function clampConfig(raw = {}) {
  const pick = (key, value) => {
    const { min, max, default: dflt } = CONFIG_LIMITS[key]
    const n = Math.floor(Number(value))
    if (!Number.isFinite(n)) return dflt
    return Math.min(max, Math.max(min, n))
  }
  return {
    initialSeconds: pick('initialSeconds', raw.initialSeconds),
    incrementSeconds: pick('incrementSeconds', raw.incrementSeconds),
    pairDailyAwardLimit: pick('pairDailyAwardLimit', raw.pairDailyAwardLimit),
    minPliesForAward: pick('minPliesForAward', raw.minPliesForAward),
    graceSeconds: pick('graceSeconds', raw.graceSeconds)
  }
}

/* ── Protocol constants ───────────────────────────────────────────────────────────────── */

// Absolute ceiling on a PvP game, independent of the clocks. Both clocks flagging is the
// normal bound; this catches a match whose timer was somehow orphaned. Two players with
// 30-minute clocks and 30-second increments can legitimately run past an hour, so this is
// deliberately generous — the RPS game's 15 minutes would sweep real games mid-play.
export const MATCH_MAX_AGE_MS = 3 * 60 * 60 * 1000

// An open room nobody joins is reaped this fast.
export const ROOM_IDLE_MS = 5 * 60 * 1000

// A draw offer stands until the offerer's next move, as in real chess. This bounds the case
// where a player offers and then never moves.
export const DRAW_OFFER_TTL_MS = 60 * 1000

// The pieces, in the letters chess.js uses. Exported so the board renderer and the engine
// agree on sprite keys without a second table.
export const PIECES = ['p', 'n', 'b', 'r', 'q', 'k']
export const PROMOTION_PIECES = ['q', 'r', 'b', 'n']
export const isPromotionPiece = (p) => PROMOTION_PIECES.includes(p)

// Square names, 'a1'..'h8'. Validated on the wire before anything reaches chess.js: chess.js
// is defensive, but a strict regex at the boundary means a malformed payload is rejected
// rather than explored.
export const SQUARE_RE = /^[a-h][1-8]$/
export const isSquare = (s) => typeof s === 'string' && SQUARE_RE.test(s)

// Why a game ended. Only the first three are decisive results that can pay points; the draw
// reasons pay nothing by design, and forfeit/sweep are abandonment.
export const DECISIVE_END_REASONS = ['checkmate', 'resign', 'flag']
export const DRAW_END_REASONS = ['stalemate', 'threefold', 'fiftymove', 'insufficient', 'agreement']

/* ── Cast ────────────────────────────────────────────────────────────────────────────────
 * `id` is the wire value and must round-trip through the AI worker, so it is a stable
 * lowercase token; everything else here is presentation and engine tuning.
 *
 * The portraits are trimmed to their own bounding box, so each has a different aspect ratio.
 * The width/height below are the real dimensions of the files in public/games/chess/ — they
 * go on the <img> so the scene never reflows while art decodes. Same discipline as
 * lib/edRps.js, and for the same reason. */
export const CHARACTERS = [
  {
    id: 'ed',
    name: 'Ed',
    tagline: 'Plays chess like he plays everything',
    difficulty: 'Easy',
    elo: 500,
    art: '/games/chess/ed.webp',
    width: 221,
    height: 384,
    accent: '#7d8b3a'
  },
  {
    id: 'computer',
    name: "Courage's Computer",
    tagline: 'Would rather be doing anything else',
    difficulty: 'Intermediate',
    elo: 1100,
    art: '/games/chess/computer.webp',
    width: 270,
    height: 240,
    accent: '#5f8f4f'
  },
  {
    id: 'mandark',
    name: 'Mandark',
    tagline: 'Has already calculated your defeat',
    difficulty: 'Advanced',
    elo: 1700,
    art: '/games/chess/mandark.webp',
    width: 291,
    height: 384,
    accent: '#3c6ea5'
  }
]

export const CHARACTER_IDS = CHARACTERS.map(c => c.id)
export const isCharacterId = (id) => CHARACTER_IDS.includes(id)
export const characterById = (id) => CHARACTERS.find(c => c.id === id) || CHARACTERS[0]
