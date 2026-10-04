// server/utils/ogGtoonEngine.js
//
// Pure match-state logic for original gToons (2002): deck order -> goal color, round
// advancement, swap validation/application, and scoring (all 3 goal-color cases + sudden
// death). No socket/db imports — everything takes and returns plain data so it is unit-testable
// on its own and reusable from server/utils/ogGtoonsSocket.js without pulling in Prisma or
// Socket.IO. Effect resolution itself lives in server/utils/ogGtoonEffects.js; this module only
// decides the hand/slot rules, swaps and the win condition.
//
// ── Hand & slot rules (every OG gToons match, PvP and practice) ─────────────────────────────
//   • 12-card deck, shuffled at match start. 6 are dealt to the hand; the other 6 stay undealt.
//   • 7 board slots, filled over 3 regulation rounds: round 1 = slots 1-4, round 2 = slots 5-6,
//     round 3 = slot 7. Each round a player may place UP TO that many cards, choosing both the
//     card (from the hand) and the slot. A slot left empty stays empty.
//   • Right after round 1 there is a discard phase: discard any number of cards still in hand,
//     then the hand is refilled back up to 6 from the undealt cards (4 + n when 4 were played
//     and n discarded). Discarded cards are out of the match.
//   • Once per match a player may swap a hand card for a random undealt card, before committing.
//   • A tie after slot 7 goes to sudden death: one extra slot (8, 9, ...) per round, each player
//     placing exactly one card from whatever hand/undealt cards they have left.

export const NEUTRAL_COLORS = new Set(['BLACK', 'SILVER'])

export function isNeutralColor(color) {
  return NEUTRAL_COLORS.has(color)
}

export const HAND_SIZE = 6
/** Regulation board: which slots each round fills. */
export const ROUND_SLOTS = [[1, 2, 3, 4], [5, 6], [7]]
export const REGULATION_ROUNDS = ROUND_SLOTS.length
export const REGULATION_SLOTS = 7
/** The discard phase happens after this round resolves. */
export const DISCARD_AFTER_ROUND = 1

/** Slots a round may fill. Sudden-death round r (> regulation) is a single extra slot. */
export function slotsForRound(round) {
  if (round >= 1 && round <= REGULATION_ROUNDS) return ROUND_SLOTS[round - 1]
  return [REGULATION_SLOTS + (round - REGULATION_ROUNDS)]
}

export function isSuddenDeathRound(round) {
  return round > REGULATION_ROUNDS
}

/** Fisher-Yates on a copy. `rng` returns [0,1). */
export function shuffled(arr, rng = Math.random) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Shuffles deck indexes 0-11 and deals the opening hand; the rest stay undealt (in order). */
export function dealOpeningHand(rng = Math.random, deckSize = 12) {
  const order = shuffled([...Array(deckSize).keys()], rng)
  return { hand: order.slice(0, HAND_SIZE), undealt: order.slice(HAND_SIZE) }
}

/**
 * Discards `discardIdxs` (deck indexes, all of which must be in `hand`, no repeats) and refills
 * the hand up to HAND_SIZE from the front of `undealt`. Returns new arrays; throws on bad input.
 */
export function discardAndDeal(hand, undealt, discardIdxs) {
  const drop = new Set(discardIdxs)
  if (drop.size !== discardIdxs.length) throw new Error('Duplicate discard')
  for (const i of drop) if (!hand.includes(i)) throw new Error('Card not in hand')
  const kept = hand.filter(i => !drop.has(i))
  const need = Math.max(0, HAND_SIZE - kept.length)
  const drawn = undealt.slice(0, need)
  return {
    hand: [...kept, ...drawn],
    undealt: undealt.slice(drawn.length),
    discarded: [...drop],
    drawn
  }
}

/**
 * Swaps `cardIdx` (in hand) for a random undealt card; the swapped-out card goes back into the
 * undealt pile. Returns new arrays plus the card drawn. Throws if the swap is not possible.
 */
export function swapForRandomUndealt(hand, undealt, cardIdx, rng = Math.random) {
  if (!hand.includes(cardIdx)) throw new Error('Card not in hand')
  if (undealt.length === 0) throw new Error('Nothing to swap with')
  const pick = Math.floor(rng() * undealt.length)
  const drawn = undealt[pick]
  const nextUndealt = undealt.slice()
  nextUndealt[pick] = cardIdx
  return { hand: hand.map(i => (i === cardIdx ? drawn : i)), undealt: nextUndealt, drawn }
}

/** The goal color is always the color of the card at position 11 (bottom of the builder deck). */
export function deriveGoalColor(orderedDeck) {
  return orderedDeck?.[11]?.color ?? null
}

/** A deck save must carry exactly 12 cards at unique positions 0-11. */
export function validateDeckPositions(cards) {
  if (!Array.isArray(cards) || cards.length !== 12) return false
  const seen = new Set()
  for (const c of cards) {
    if (typeof c.position !== 'number' || !Number.isInteger(c.position)) return false
    if (c.position < 0 || c.position > 11) return false
    if (seen.has(c.position)) return false
    seen.add(c.position)
  }
  return seen.size === 12
}

/**
 * Whether a swap request may be applied right now.
 * @param {object} state - { swapUsed, pointBalance, roundRevealed }
 *   roundRevealed: true once the current round's reveal has already broadcast — a swap after
 *   that point is a no-op the client cannot benefit from and must be rejected server-side, not
 *   merely hidden in the UI.
 */
export function canSwap({ swapUsed, pointBalance, roundRevealed }) {
  if (swapUsed) return { ok: false, reason: 'swap_used' }
  if (roundRevealed) return { ok: false, reason: 'already_revealed' }
  if ((pointBalance || 0) < 10) return { ok: false, reason: 'insufficient_points' }
  return { ok: true }
}

export const SWAP_COST = 10

/**
 * LEGACY fixed-order swap (kept for its unit tests; matches no longer use deck order).
 * Swaps the up-next card (index 0 of the remaining unplayed deck) with another still-unplayed
 * card from the SAME deck. `remainingDeck` is the ordered list of cards this player has not yet
 * revealed; `swapWithIndex` is an index into that same array (1..length-1).
 * Returns a NEW array; does not mutate the input.
 */
export function applySwap(remainingDeck, swapWithIndex) {
  if (!Array.isArray(remainingDeck) || remainingDeck.length < 2) {
    throw new Error('Nothing to swap with')
  }
  if (!Number.isInteger(swapWithIndex) || swapWithIndex <= 0 || swapWithIndex >= remainingDeck.length) {
    throw new Error('Invalid swap target')
  }
  const next = remainingDeck.slice()
  const tmp = next[0]
  next[0] = next[swapWithIndex]
  next[swapWithIndex] = tmp
  return next
}

function sum(nums) {
  return nums.reduce((a, b) => a + b, 0)
}

function countColor(revealed, color) {
  return revealed.filter(r => r.color === color).length
}

/**
 * Determines the outcome of a completed (or sudden-death-extended) match.
 *
 * @param {object} params
 * @param {string} params.player1GoalColor
 * @param {string} params.player2GoalColor
 * @param {Array<{finalValue:number,color:string}>} params.player1Revealed
 * @param {Array<{finalValue:number,color:string}>} params.player2Revealed
 * @returns {{ winner: 'player1'|'player2'|null, reason: string, player1Score: number,
 *             player2Score: number, bonus: object|null }}
 *   winner === null means a genuine tie (sudden death should continue, or if both decks are
 *   exhausted, the match ends in an actual tie).
 */
export function determineWinner({ player1GoalColor, player2GoalColor, player1Revealed, player2Revealed }) {
  const p1Total = sum(player1Revealed.map(r => r.finalValue))
  const p2Total = sum(player2Revealed.map(r => r.finalValue))
  const p1Neutral = isNeutralColor(player1GoalColor)
  const p2Neutral = isNeutralColor(player2GoalColor)

  let player1Score = p1Total
  let player2Score = p2Total
  let bonus = null

  if (!p1Neutral && !p2Neutral) {
    // Both non-neutral: outright win if you have MORE cards of BOTH goal colors than opponent.
    const p1OfP1 = countColor(player1Revealed, player1GoalColor)
    const p2OfP1 = countColor(player2Revealed, player1GoalColor)
    const p1OfP2 = countColor(player1Revealed, player2GoalColor)
    const p2OfP2 = countColor(player2Revealed, player2GoalColor)
    const p1WinsOutright = p1OfP1 > p2OfP1 && p1OfP2 > p2OfP2
    const p2WinsOutright = p2OfP1 > p1OfP1 && p2OfP2 > p1OfP2
    if (p1WinsOutright) return { winner: 'player1', reason: 'both_colors', player1Score, player2Score, bonus }
    if (p2WinsOutright) return { winner: 'player2', reason: 'both_colors', player1Score, player2Score, bonus }
    // else fall through to total value below
  } else if (p1Neutral !== p2Neutral) {
    // Exactly one non-neutral: that color's card-count leader gets +15 before comparing totals.
    const nonNeutralColor = p1Neutral ? player2GoalColor : player1GoalColor
    const p1Count = countColor(player1Revealed, nonNeutralColor)
    const p2Count = countColor(player2Revealed, nonNeutralColor)
    if (p1Count > p2Count) {
      player1Score += 15
      bonus = { player: 'player1', color: nonNeutralColor, count: p1Count }
    } else if (p2Count > p1Count) {
      player2Score += 15
      bonus = { player: 'player2', color: nonNeutralColor, count: p2Count }
    }
  }
  // Both neutral (or the both-non-neutral fallback): higher total value wins.

  if (player1Score > player2Score) return { winner: 'player1', reason: 'total_value', player1Score, player2Score, bonus }
  if (player2Score > player1Score) return { winner: 'player2', reason: 'total_value', player1Score, player2Score, bonus }
  return { winner: null, reason: 'tie', player1Score, player2Score, bonus }
}

/**
 * Sudden death: on a tie after slot 7, each player places one more card per round from whatever
 * is left in hand/undealt. If either player runs out before the tie breaks, no further
 * sudden-death round can be played and the match ends in a real tie.
 */
export function hasSuddenDeathCardsRemaining(cards) {
  return Array.isArray(cards) && cards.length > 0
}
