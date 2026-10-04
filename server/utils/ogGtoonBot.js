// server/utils/ogGtoonBot.js
//
// The practice-mode opponent for original gToons (2002). Pure functions only — no socket, db or
// points imports — so the bot is unit-testable and cannot, by construction, touch anything
// outside the plain data it is handed.
//
// A match has no per-round card choice (cards reveal in deck order), so a bot's whole game is:
//   1. what order its deck is in, and
//   2. whether/when to use its one swap.
//
// Fairness: `chooseBotSwap` is given only what a human opponent could see — the bot's own
// remaining cards, the round number, the bot's own goal color and the human's *revealed* cards.
// It is never handed the human's unrevealed order.

import { isNeutralColor } from './ogGtoonEngine.js'

export const BOT_USERNAME = 'Practice Bot'
export const BOT_ID = 'practice-bot'
export const DIFFICULTIES = ['easy', 'normal', 'hard']
export const DEFAULT_DIFFICULTY = 'normal'

// Rounds that decide a match in regulation (ogGtoonMatchCore.TOTAL_ROUNDS); cards beyond this
// only matter in sudden death.
const REGULATION_ROUNDS = 7

export function normalizeDifficulty(d) {
  return DIFFICULTIES.includes(d) ? d : DEFAULT_DIFFICULTY
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** How much the bot likes a card (value, plus a goal-color bonus on Hard). */
function cardScore(card, goalColor, difficulty) {
  let score = card.value || 0
  if (difficulty === 'hard' && goalColor && !isNeutralColor(goalColor) && card.color === goalColor) {
    score += 2
  }
  return score
}

/**
 * Builds the bot's 12-card ordered deck from the player's verified deck snapshot. Returns NEW
 * card objects with renumbered `position`s; the input is not mutated.
 *
 *   easy   — every card shuffled, including the bottom (goal) card, so the bot's goal color is
 *            random and it often wastes good cards beyond round 7.
 *   normal — the player's goal card stays at position 11 (same goal color as the player), the
 *            other 11 shuffled.
 *   hard   — same bottom card, but the 7 cards that count in regulation are the 7 best of the
 *            other 11 (shuffled among themselves so the bot is not trivially predictable).
 */
export function buildBotDeck(deck, difficulty = DEFAULT_DIFFICULTY, rng = Math.random) {
  const level = normalizeDifficulty(difficulty)
  const cards = deck.map(c => ({ ...c }))
  let ordered
  if (level === 'easy') {
    ordered = shuffleInPlace(cards, rng)
  } else {
    const bottom = cards[11]
    const rest = cards.slice(0, 11)
    if (level === 'hard') {
      const goal = bottom.color
      // Sort best-first with a random tiebreak, split into the regulation window and the rest.
      const ranked = rest
        .map(c => ({ c, s: cardScore(c, goal, 'hard'), r: rng() }))
        .sort((a, b) => (b.s - a.s) || (a.r - b.r))
        .map(x => x.c)
      const head = shuffleInPlace(ranked.slice(0, REGULATION_ROUNDS), rng)
      const tail = shuffleInPlace(ranked.slice(REGULATION_ROUNDS), rng)
      ordered = [...head, ...tail, bottom]
    } else {
      ordered = [...shuffleInPlace(rest, rng), bottom]
    }
  }
  return ordered.map((c, i) => ({ ...c, position: i }))
}

/**
 * Decides whether the bot swaps its up-next card this round.
 *
 * @param {object} view
 * @param {string} view.difficulty
 * @param {boolean} view.swapUsed
 * @param {number} view.round               current round (1-based)
 * @param {Array}  view.remaining           bot's own unrevealed cards, up-next first
 * @param {string} view.goalColor           the bot's own goal color
 * @returns {number|null} an index into `remaining` (1..length-1) to swap with, or null
 */
export function chooseBotSwap({ difficulty, swapUsed, round, remaining, goalColor }) {
  const level = normalizeDifficulty(difficulty)
  if (level === 'easy' || swapUsed) return null
  if (!Array.isArray(remaining) || remaining.length < 2) return null
  // Past regulation the match is in sudden death; a swap is rarely worth burning there.
  if (round > REGULATION_ROUNDS) return null

  const threshold = level === 'hard' ? 2 : 3
  const upNext = cardScore(remaining[0], goalColor, level)
  let bestIdx = -1
  let bestScore = -Infinity
  for (let i = 1; i < remaining.length; i++) {
    const s = cardScore(remaining[i], goalColor, level)
    if (s > bestScore) { bestScore = s; bestIdx = i }
  }
  return bestIdx !== -1 && bestScore - upNext >= threshold ? bestIdx : null
}

/** Cosmetic think time before the bot commits a round (the choice itself is already made). */
export function botCommitDelayMs(rng = Math.random) {
  return 1200 + Math.floor(rng() * 2800)
}
