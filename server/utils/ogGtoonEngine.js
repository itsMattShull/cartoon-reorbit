// server/utils/ogGtoonEngine.js
//
// Pure match-state logic for original gToons (2002): goal color, live per-round hand-pick
// validation, batch progression, and scoring (all 3 goal-color cases + sudden death). No
// socket/db imports — everything takes and returns plain data so it is unit-testable on its own
// and reusable from server/utils/ogGtoonsSocket.js without pulling in Prisma or Socket.IO.
// Effect resolution itself lives in server/utils/ogGtoonEffects.js; this module only decides
// goal color, which picks are legal, batch progression and the win condition.
//
// ── Live hand selection + batched reveals (feature 1 + 3) ──────────────────────────────────
// A deck's 12 cards are no longer revealed in their saved `position` order. Positions 0-10 are
// an unordered pool the player picks from live, during the match; position 11 stays the goal
// card (its color is the match's goal color from the moment the match starts, per
// `deriveGoalColor`) and cannot be voluntarily picked during the three normal batches — see
// `canCommitCard`'s `allowGoalCard` param. Cards reveal in three batches of BATCH_QUOTAS
// (4, then 2, then 1 — 7 total, matching the original TOTAL_ROUNDS) rather than one at a time;
// each side fills their own batch quota with individual picks (still validated one at a time,
// via `canCommitCard`/`applyBatchCommit`), and a batch only reveals once BOTH sides have filled
// theirs. Sudden death (past all three batches, still tied) reverts to single-card rounds
// (quota 1), now with `allowGoalCard: true` since every other card is already spent.
//
// The once-per-match "swap the up-next card" mechanic this replaced is gone entirely: it only
// ever made sense when the reveal order was forced. If you can always just choose to play a
// different card, there's nothing left to swap.

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

/** Batch sizes for the three normal reveal batches — 4 + 2 + 1 = TOTAL_ROUNDS (7). */
export const BATCH_QUOTAS = [4, 2, 1]

/**
 * Whether `position` (a deck slot 0-11, resolved by the caller from the committed `ctoonId`) may
 * be added to this side's in-progress batch pick right now.
 * @param {object} state
 *   remainingIdx: still-unplayed deck positions for this side
 *   pending: positions already picked (committed, not yet revealed) for the CURRENT batch
 *   position: the deck position being committed
 *   quota: how many picks this batch needs (BATCH_QUOTAS[currentBatch-1], or 1 in sudden death)
 *   allowGoalCard: true once every other card is spent (sudden death) — the goal card (position
 *     11) can never be voluntarily picked during the three normal batches.
 */
export function canCommitCard({ remainingIdx, pending, position, quota, allowGoalCard }) {
  if (position == null || !Array.isArray(remainingIdx) || !remainingIdx.includes(position)) {
    return { ok: false, reason: 'not_available' }
  }
  if (Array.isArray(pending) && pending.includes(position)) return { ok: false, reason: 'already_pending' }
  if (position === 11 && !allowGoalCard) return { ok: false, reason: 'goal_card_reserved' }
  if ((pending?.length || 0) >= quota) return { ok: false, reason: 'batch_full' }
  return { ok: true }
}

/** Moves `position` from `remainingIdx` to `pending`. Returns NEW arrays; never mutates input. */
export function applyBatchCommit(remainingIdx, pending, position) {
  return {
    remainingIdx: remainingIdx.filter(p => p !== position),
    pending: [...pending, position]
  }
}

/** Whether this side has filled its quota for the current batch and is ready to reveal. */
export function isBatchFull(pending, quota) {
  return (pending?.length || 0) >= quota
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
