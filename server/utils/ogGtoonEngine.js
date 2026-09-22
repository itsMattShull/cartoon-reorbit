// server/utils/ogGtoonEngine.js
//
// Pure match-state logic for original gToons (2002): deck order -> goal color, round
// advancement, swap validation/application, and scoring (all 3 goal-color cases + sudden
// death). No socket/db imports — everything takes and returns plain data so it is unit-testable
// on its own and reusable from server/utils/ogGtoonsSocket.js without pulling in Prisma or
// Socket.IO. Effect resolution itself lives in server/utils/ogGtoonEffects.js; this module only
// decides deck order, swaps and the win condition.

export const NEUTRAL_COLORS = new Set(['BLACK', 'SILVER'])

export function isNeutralColor(color) {
  return NEUTRAL_COLORS.has(color)
}

/** The goal color is always the color of the card at position 11 (bottom of the deck). */
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
 * Sudden death: on a tie after 7 rounds, each player reveals one more card, continuing down
 * their OWN deck order from position 7 onward (positions 7-11, i.e. up to 5 extra rounds — see
 * gtoons-plan.md's resolved open question). If a player's deck is fully exhausted before the tie
 * breaks, no further sudden-death round can be played for them and the match ends in a real tie.
 */
export function hasSuddenDeathCardsRemaining(remainingDeck) {
  return Array.isArray(remainingDeck) && remainingDeck.length > 0
}
