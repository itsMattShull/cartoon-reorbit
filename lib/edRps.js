// Ed, Edd n Eddy Rock Paper Scissors — shared rules and cast.
//
// Imported by BOTH the browser (pages/newsite/edrps.vue, for the CPU practice mode and for
// rendering a resolved round) and the server (server/socket-server.js, which is the sole
// authority for anything played for points). It lives in lib/ for the same reason
// lib/asteroidSim.js does: one copy, so the two sides cannot drift.
//
// There are no secrets in here. Rock-paper-scissors has no hidden information beyond the
// opponent's current-round hand, and that lives in the server's match state, never in this
// file. Everything here is public rules.

// Hands are indices, not strings, everywhere they cross the wire. Two reasons: BEATS below is
// a flat lookup, and 'rock'/'paper'/'scissors' are 4/5/8 bytes — a hand-shaped payload size is
// an observable side channel during the pre-reveal window.
export const HANDS = ['rock', 'paper', 'scissors']
export const ROCK = 0
export const PAPER = 1
export const SCISSORS = 2

export const isHand = (h) => Number.isInteger(h) && h >= 0 && h < HANDS.length

// Hand art, indexed to match HANDS above.
//
// These are images rather than the ✊/✋/✌️ emoji the game shipped with, because emoji are a
// font, not a guarantee — a device without colour emoji coverage (or one that renders ✌️ as
// text via its variation selector) shows a blank or a tofu box where the throw should be, and
// that is exactly what happened in a real match. Bundled art always draws.
export const HAND_ART = [
  { art: '/games/edrps/hand-rock.webp', width: 112, height: 124 },
  { art: '/games/edrps/hand-paper.webp', width: 91, height: 159 },
  { art: '/games/edrps/hand-scissors.webp', width: 163, height: 120 }
]

// How long the result of a round stays on screen before the next one is armed. The server
// owns this — it is what stops the next round's timer starting the instant a hand resolves —
// and the client mirrors it so the final round's result is readable before the match-over
// panel covers it.
export const ROUND_BREAK_MS = 2600

// BEATS[a] is the hand that `a` defeats.
const BEATS = [SCISSORS, ROCK, PAPER]

/**
 * Scores one round. Returns 0 for a tie, 1 if `a` wins, -1 if `b` wins.
 * A tie replays the round — it does not count toward either player's score.
 */
export function compareHands(a, b) {
  if (a === b) return 0
  return BEATS[a] === b ? 1 : -1
}

// The cast. `id` is the wire value and must round-trip through the DB, so it is a stable
// lowercase token; everything else here is presentation.
export const CHARACTERS = [
  {
    id: 'ed',
    name: 'Ed',
    tagline: 'Buttered toast enthusiast',
    art: '/games/edrps/ed.webp',
    // The sprites are trimmed to their own bounding box, so each one has a different aspect
    // ratio. These are the real dimensions of the files in public/games/edrps/ — they go on
    // the <img> so the scene never reflows while art decodes.
    width: 219,
    height: 384,
    accent: '#7d8b3a',
    lines: {
      win: ['I won! Buttered toast for everyone!', 'Gravy!', 'Ed smash... politely!'],
      lose: ['Aw, my brain hurts.', 'I lost. Can I have a chicken?', 'But I was thinking so hard!'],
      tie: ['We both did the same thing!', 'Are we twins now?']
    }
  },
  {
    id: 'edd',
    name: 'Edd',
    tagline: 'Prefers to be called Double D',
    art: '/games/edrps/edd.webp',
    width: 186,
    height: 384,
    accent: '#e0662a',
    lines: {
      win: ['A statistically pleasing outcome!', 'Victory through preparation!', 'Oh my, I actually won!'],
      lose: ['Well, that was statistically improbable.', 'I must recalibrate my strategy.', 'Filthy luck!'],
      tie: ['A perfect stalemate. Fascinating!', 'Identical selections. What are the odds?']
    }
  },
  {
    id: 'eddy',
    name: 'Eddy',
    tagline: 'Scam artist, jawbreaker fiend',
    art: '/games/edrps/eddy.webp',
    width: 283,
    height: 384,
    accent: '#f2c231',
    lines: {
      win: ['Read \'em and weep, sucker!', 'That\'s how Eddy does it!', 'Jawbreakers, here I come!'],
      lose: ['You cheated! I know it!', 'Rematch! RIGHT NOW!', 'Ah, I let ya win.'],
      tie: ['Quit copyin\' me!', 'No fair, do it again!']
    }
  }
]

export const CHARACTER_IDS = CHARACTERS.map(c => c.id)
export const isCharacterId = (id) => CHARACTER_IDS.includes(id)
export const characterById = (id) => CHARACTERS.find(c => c.id === id) || CHARACTERS[0]

// Defaults mirrored by GameConfig's edRps* columns. The server clamps to these ranges on read,
// so a bad admin value can never break a live match.
export const CONFIG_LIMITS = {
  roundSeconds: { min: 5, max: 60, default: 15 },
  winsNeeded: { min: 1, max: 10, default: 4 },
  maxRounds: { min: 1, max: 21, default: 7 },
  pairDailyAwardLimit: { min: 0, max: 50, default: 2 }
}

export function clampConfig(raw = {}) {
  const pick = (key, value) => {
    const { min, max, default: dflt } = CONFIG_LIMITS[key]
    const n = Math.floor(Number(value))
    if (!Number.isFinite(n)) return dflt
    return Math.min(max, Math.max(min, n))
  }
  const winsNeeded = pick('winsNeeded', raw.winsNeeded)
  // A best-of-N needs at least 2N-1 rounds for both players to be able to reach N wins.
  // Admin values that violate that would hang a match at match point forever.
  const maxRounds = Math.max(pick('maxRounds', raw.maxRounds), winsNeeded * 2 - 1)
  return {
    roundSeconds: pick('roundSeconds', raw.roundSeconds),
    winsNeeded,
    maxRounds,
    pairDailyAwardLimit: pick('pairDailyAwardLimit', raw.pairDailyAwardLimit)
  }
}
