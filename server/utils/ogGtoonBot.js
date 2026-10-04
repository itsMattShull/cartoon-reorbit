// server/utils/ogGtoonBot.js
//
// The practice-mode opponent for original gToons (2002). Pure functions only — no socket, db or
// points imports — so the bot is unit-testable and cannot, by construction, touch anything
// outside the plain data it is handed.
//
// The bot plays by the same rules as a human: it is dealt a hand, chooses which cards go in which
// slots each round, may discard after round 1, and may use its one swap. Its whole game is:
//   1. which deck it brings (see buildBotDeck),
//   2. which hand cards it places each round (chooseBotPlacements),
//   3. which cards it discards (chooseBotDiscards), and
//   4. whether it swaps (chooseBotSwap).
//
// Fairness: every chooser is given only what a human could see about the bot's own side — its
// own hand and undealt cards, the round's open slots, and its own goal color. None of them is
// ever handed the human's hand, placements or undealt cards.

import { isNeutralColor, REGULATION_ROUNDS } from './ogGtoonEngine.js'

export const BOT_USERNAME = 'Practice Bot'
export const BOT_ID = 'practice-bot'
export const DIFFICULTIES = ['easy', 'normal', 'hard']
export const DEFAULT_DIFFICULTY = 'normal'


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
 * Builds the bot's 12-card deck from the player's verified deck snapshot. Returns NEW card
 * objects with renumbered `position`s; the input is not mutated. Cards are dealt in random order
 * at match start, so only the bottom (position 11) card matters: it sets the goal color.
 *
 *   easy   — every card shuffled, including the bottom (goal) card, so the bot's goal color is
 *            random.
 *   normal / hard — the player's goal card stays at position 11 (same goal color as the player),
 *            the other 11 shuffled.
 */
export function buildBotDeck(deck, difficulty = DEFAULT_DIFFICULTY, rng = Math.random) {
  const level = normalizeDifficulty(difficulty)
  const cards = deck.map(c => ({ ...c }))
  let ordered
  if (level === 'easy') {
    ordered = shuffleInPlace(cards, rng)
  } else {
    const bottom = cards[11]
    ordered = [...shuffleInPlace(cards.slice(0, 11), rng), bottom]
  }
  return ordered.map((c, i) => ({ ...c, position: i }))
}

/**
 * Picks the cards the bot places this round and the slot each goes in.
 *
 * @param {object} view
 * @param {string} view.difficulty
 * @param {number[]} view.slots        open slots this round, ascending
 * @param {Array}  view.hand           the bot's hand: [{ idx, value, color, ... }]
 * @param {string} view.goalColor      the bot's own goal color
 * @param {Function} [view.rng]
 * @returns {Array<{cardIdx:number, slot:number}>}
 */
export function chooseBotPlacements({ difficulty, slots, hand, goalColor, rng = Math.random }) {
  const level = normalizeDifficulty(difficulty)
  if (!Array.isArray(hand) || !Array.isArray(slots)) return []
  const count = Math.min(slots.length, hand.length)
  let picked
  if (level === 'easy') {
    picked = shuffleInPlace(hand.slice(), rng).slice(0, count)
  } else {
    // Best cards first; a random tiebreak keeps the bot from being trivially predictable.
    picked = hand
      .map(c => ({ c, s: cardScore(c, goalColor, level), r: rng() }))
      .sort((a, b) => (b.s - a.s) || (a.r - b.r))
      .slice(0, count)
      .map(x => x.c)
  }
  return picked.map((c, i) => ({ cardIdx: c.idx, slot: slots[i] }))
}

/**
 * Decides which hand cards the bot discards after round 1. Easy never discards; Normal/Hard drop
 * a card only when it is clearly worse than the average of the bot's own undealt cards (which the
 * refill would draw from).
 *
 * @returns {number[]} deck indexes (from `hand`) to discard
 */
export function chooseBotDiscards({ difficulty, hand, undealt, goalColor }) {
  const level = normalizeDifficulty(difficulty)
  if (level === 'easy') return []
  if (!Array.isArray(hand) || !Array.isArray(undealt) || undealt.length === 0) return []
  const avg = undealt.reduce((a, c) => a + cardScore(c, goalColor, level), 0) / undealt.length
  const margin = level === 'hard' ? 1 : 2
  // Never discard more cards than there are undealt cards to replace them with.
  return hand
    .filter(c => avg - cardScore(c, goalColor, level) >= margin)
    .sort((a, b) => cardScore(a, goalColor, level) - cardScore(b, goalColor, level))
    .slice(0, undealt.length)
    .map(c => c.idx)
}

/**
 * Decides whether the bot swaps a hand card for a random undealt card this round. It looks at the
 * weakest card it would otherwise play and swaps it out when the undealt cards average clearly
 * better.
 *
 * @param {object} view
 * @param {string} view.difficulty
 * @param {boolean} view.swapUsed
 * @param {number} view.round               current round (1-based)
 * @param {number} view.slotCount           how many cards the bot will place this round
 * @param {Array}  view.hand                bot's hand
 * @param {Array}  view.undealt             bot's own undealt cards
 * @param {string} view.goalColor
 * @returns {number|null} deck index of the hand card to swap out, or null
 */
export function chooseBotSwap({ difficulty, swapUsed, round, slotCount, hand, undealt, goalColor }) {
  const level = normalizeDifficulty(difficulty)
  if (level === 'easy' || swapUsed) return null
  if (!Array.isArray(hand) || !Array.isArray(undealt) || undealt.length === 0 || hand.length === 0) return null
  // Past regulation the match is in sudden death; a swap is rarely worth burning there.
  if (round > REGULATION_ROUNDS) return null

  const ranked = hand
    .map(c => ({ c, s: cardScore(c, goalColor, level) }))
    .sort((a, b) => b.s - a.s)
  const weakestPlayed = ranked[Math.min(Math.max(slotCount, 1), ranked.length) - 1]
  const avg = undealt.reduce((a, c) => a + cardScore(c, goalColor, level), 0) / undealt.length
  const threshold = level === 'hard' ? 2 : 3
  return avg - weakestPlayed.s >= threshold ? weakestPlayed.c.idx : null
}

/** Cosmetic think time before the bot commits a round (the choice itself is already made). */
export function botCommitDelayMs(rng = Math.random) {
  return 1200 + Math.floor(rng() * 2800)
}
