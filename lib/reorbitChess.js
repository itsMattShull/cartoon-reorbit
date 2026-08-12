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
    // null and '' are MISSING, not zero. Number(null) is 0, which is finite, so without this
    // guard a column that has never been set clamps to the minimum instead of falling back to
    // the default — a fresh row would hand out a 60-second clock rather than a 5-minute one.
    if (value === null || value === undefined || value === '') return dflt
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

/* ── Dialogue ────────────────────────────────────────────────────────────────────────────
 * Every line is written in-voice and original — none is lifted from a script.
 *
 * Kept under ~60 characters because the bubble is a fixed-height strip on a phone (a bubble
 * that grows would resize the board, and on a board being tapped that means the destination
 * square slides out from under a finger already moving). Anything longer is truncated by CSS
 * rather than wrapping, so length is a real constraint and not a style note.
 *
 * Event keys are driven by pages/newsite/reorbitchess.vue from the game state and the AI's
 * own telemetry — `lost` from pickMove() is what lets a character react to its OWN mistake,
 * which is most of what makes Ed feel like a person rather than a difficulty setting. */
export const LINES = {
  ed: {
    greeting: ['Chess! Is that the one with horsies?', 'Hiya! I brought gravy.', 'My brain is all warmed up and buttery!'],
    move: ['I moved the pointy one!', 'Zigzag! That is my strategy.', 'This guy looked lonely over there.', 'Wheee!'],
    capture: ['Om nom nom! Got one!', 'Mine now! Finders keepers!', 'I bet that one was made of toast.'],
    check: ['Your king guy is in trouble!', 'Look out! I did a thing!', 'Is that check? Did I do a check?'],
    lostPiece: ['Aw, he was my favorite.', 'You took my little guy!', 'Come back, buddy!'],
    inCheck: ['Eep! Not the king!', 'My brain hurts!', 'Hide, king guy, hide!'],
    playerBlunder: ['You left that one just sitting there!', 'Is that a present? For me?', 'Free chicken!'],
    losing: ['This is harder than buttering toast.', 'I think I am losing. Is gravy allowed?', 'Uh oh.'],
    winning: ['Am I winning? I think I am winning!', 'Gravy for everyone!', 'Ed is good at chess now!'],
    win: ['I WIN! Buttered toast for everyone!', 'Yes! Yes! Wait, what happened?', 'Chess is my favorite thing today!'],
    loss: ['Aw, my brain hurts.', 'You got my king guy. Good job!', 'Can we play the horsie one now?'],
    draw: ['Nobody won? So we both won!', 'A tie! Like my shoelaces!', 'Is that good? I think that is good.'],
    slow: ['Are you thinking? I can hear it.', 'I will wait. I am good at waiting.', 'Take your time. I found a rock.'],
    playerPromote: ['Your little guy grew up!', 'Whoa! He got big!'],
    aiPromote: ['My guy is a big guy now!', 'He ate all his vegetables!']
  },
  computer: {
    greeting: ['Oh good. You again.', 'I was busy. Fine. Let us play.', 'Chess. How thrilling.'],
    move: ['There. Your turn.', 'Obviously.', 'I have moved. Try to keep up.', 'Done.'],
    capture: ['That was poorly guarded.', 'I will be having that.', 'Taken. You may thank me later.'],
    check: ['Check. Do try to notice.', 'Your king is exposed. Again.', 'Check. This should not surprise you.'],
    lostPiece: ['Fine. Take it.', 'I allowed that.', 'Noted. Filed under lucky.'],
    inCheck: ['Yes, yes, I see it.', 'Congratulations. You found a check.', 'How very clever of you.'],
    playerBlunder: ['You cannot be serious.', 'That was a mistake. A large one.', 'Did you mean to do that?'],
    losing: ['This is beneath me.', 'Recalculating. Loudly.', 'Well. This is going badly.'],
    winning: ['This is going exactly as expected.', 'Would you like to concede now?', 'I could do this in my sleep.'],
    win: ['Checkmate. Obviously.', 'That took longer than it should have.', 'I win. Please do not ask again.'],
    loss: ['...Well. That happened.', 'Enjoy it. It will not happen twice.', 'I need a moment.'],
    draw: ['A draw. How deeply unsatisfying.', 'Nobody wins. Typical.', 'Well, that was a waste of us both.'],
    slow: ['Any day now.', 'I have all the time in the world. Sadly.', 'Still waiting.'],
    playerPromote: ['A queen. Wonderful. For you.', 'Lovely. Now I have two problems.'],
    aiPromote: ['Promoted. As planned.', 'Now there are two of them.']
  },
  mandark: {
    greeting: ['Ah, a challenger! HA HA HAAA!', 'You may move first. I insist.', 'Prepare to be thoroughly out-thought!'],
    move: ['Calculated. Naturally.', 'Move one of fourteen. You will see.', 'Behold, brilliance in motion!'],
    capture: ['Your piece is now MY piece!', 'A necessary sacrifice. Yours.', 'HA! It was never yours to keep.'],
    check: ['Check! And it only gets worse!', 'Your king trembles, as he should.', 'I have you. Squirm!'],
    lostPiece: ['Bah! A trivial loss.', 'I permitted that. Strategy!', 'Enjoy it. It changes nothing.'],
    inCheck: ['You DARE?!', 'A fluke. Nothing more.', 'My king is merely repositioning!'],
    playerBlunder: ['HA HA HAAA! What was THAT?', 'Even Dexter would not blunder so.', 'You have handed me the game!'],
    losing: ['This is not in my calculations.', 'Impossible! Recalculating!', 'You are LUCKY, that is all!'],
    winning: ['My victory is a formality now.', 'Dexter would have lasted longer.', 'Resign and spare us both.'],
    win: ['CHECKMATE! HA HA HAAA!', 'Superior intellect prevails!', 'Tell Dexter what happened here.'],
    loss: ['NOOO! This is IMPOSSIBLE!', 'You cheated. Somehow. I will prove it.', 'Rematch! IMMEDIATELY!'],
    draw: ['A draw?! Unacceptable!', 'I was CLEARLY winning.', 'This proves nothing!'],
    slow: ['Tick tock, challenger.', 'Overwhelmed already?', 'Do take your time. It will not help.'],
    playerPromote: ['A new queen? How quaint.', 'That will not save you!'],
    aiPromote: ['Behold! A second queen!', 'My army grows. HA HA HAAA!']
  }
}

/** Picks a line for a character and event, avoiding an immediate repeat of `last`. */
export function pickLine (characterId, event, last = null) {
  const set = LINES[characterId] && LINES[characterId][event]
  if (!set || !set.length) return null
  if (set.length === 1) return set[0]
  let line = set[Math.floor(Math.random() * set.length)]
  if (line === last) line = set[(set.indexOf(line) + 1) % set.length]
  return line
}

export const CHARACTER_IDS = CHARACTERS.map(c => c.id)
export const isCharacterId = (id) => CHARACTER_IDS.includes(id)
export const characterById = (id) => CHARACTERS.find(c => c.id === id) || CHARACTERS[0]
