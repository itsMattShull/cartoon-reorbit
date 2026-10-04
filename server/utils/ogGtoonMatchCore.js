// server/utils/ogGtoonMatchCore.js
//
// Match-state logic shared by original gToons (2002) PvP (ogGtoonsSocket.js) and Practice mode
// (ogGtoonsPractice.js). Everything here operates on a plain `match` object and never touches
// Prisma, Socket.IO, Redis or points — so both modes resolve rounds, scoring and the public
// per-player view with literally the same code and cannot drift apart, while the parts that DO
// differ (stakes, swap cost, persistence, matchmaking) stay in the module that owns them.
//
// Match shape (index 0 / 1 = player 1 / player 2):
//   { id, players, usernames, deckOrder, goalColor, swapUsed, ready, revealed, stake,
//     currentRound, practice?,
//     hand,        // [[deckIdx...], [deckIdx...]]  cards each player holds (private to them)
//     undealt,     // [[deckIdx...], [deckIdx...]]  not yet dealt (private; the discard-phase draw)
//     discarded,   // [[deckIdx...], [deckIdx...]]  out of the match
//     placements,  // [[{slot, cardIdx}...], ...]   this round's placements, not yet revealed
//     phase,       // 'play' | 'discard'
//     discardReady // [bool, bool] during the discard phase }
// See ogGtoonEngine.js's header for the hand/slot rules.

import { resolveFinalBoard } from './ogGtoonEffects.js'
import {
  determineWinner, hasSuddenDeathCardsRemaining, dealOpeningHand, discardAndDeal,
  swapForRandomUndealt, slotsForRound, isSuddenDeathRound, REGULATION_ROUNDS, DISCARD_AFTER_ROUND
} from './ogGtoonEngine.js'

export const TOTAL_ROUNDS = REGULATION_ROUNDS

/** Builds an immutable per-card snapshot embedding everything round/final-board resolution ever needs. */
export function toSnapshotCard(ctoon, position) {
  return {
    ctoonId: ctoon.id,
    name: ctoon.name,
    assetPath: ctoon.assetPath,
    characters: Array.isArray(ctoon.characters) ? ctoon.characters : [],
    color: ctoon.gtoonColor,
    value: ctoon.gtoonValue ?? 0,
    type1: ctoon.gtoonType1 ?? null,
    type2: ctoon.gtoonType2 ?? null,
    type3: ctoon.gtoonType3 ?? null,
    group: ctoon.gtoonGroup ?? null,
    isSlam: !!ctoon.isSlamGtoon,
    effect: ctoon.gtoonEffect ?? null,
    position
  }
}

/** Match setup shared by PvP and practice: shuffle each deck and deal the opening hands. */
export function initHands(match, rng = Math.random) {
  match.hand = [[], []]
  match.undealt = [[], []]
  match.discarded = [[], []]
  for (const i of [0, 1]) {
    const dealt = dealOpeningHand(rng, match.deckOrder[i].length)
    match.hand[i] = dealt.hand
    match.undealt[i] = dealt.undealt
  }
  match.placements = [[], []]
  match.phase = 'play'
  match.discardReady = [false, false]
  match.ready = [false, false]
  match.swapUsed = [false, false]
  match.revealed = [[], []]
  match.currentRound = 1
  return match
}

/** A card as the OWNER sees it in their hand — never sent to the opponent. */
function handCardView(match, meIdx, deckIdx) {
  const c = match.deckOrder[meIdx][deckIdx]
  return {
    idx: deckIdx, ctoonId: c.ctoonId, name: c.name, assetPath: c.assetPath, color: c.color,
    value: c.value, type1: c.type1, type2: c.type2, type3: c.type3, group: c.group
  }
}

export function publicMatchView(match, uid) {
  const meIdx = match.players.indexOf(uid)
  const oppIdx = meIdx === 0 ? 1 : 0
  const slots = slotsForRound(match.currentRound)
  const myPlacements = match.placements?.[meIdx] || []
  const oppPlacements = match.placements?.[oppIdx] || []
  return {
    matchId: match.id,
    round: match.currentRound,
    totalRounds: TOTAL_ROUNDS,
    suddenDeath: isSuddenDeathRound(match.currentRound),
    phase: match.phase || 'play',
    // Slots the current round may fill, and how many cards may go in them.
    roundSlots: slots,
    // Only present on practice matches, so PvP payloads are unchanged.
    ...(match.practice ? { practice: true, difficulty: match.difficulty } : {}),
    you: {
      userId: uid,
      username: match.usernames[meIdx],
      goalColor: match.goalColor[meIdx],
      goalCard: { name: match.deckOrder[meIdx][11].name, assetPath: match.deckOrder[meIdx][11].assetPath, color: match.deckOrder[meIdx][11].color },
      swapUsed: match.swapUsed[meIdx],
      stake: match.stake[meIdx],
      revealed: match.revealed[meIdx],
      // Private: the owner always sees their own hand and where they have placed cards.
      hand: (match.hand?.[meIdx] || []).map(i => handCardView(match, meIdx, i)),
      placements: myPlacements.map(p => ({ slot: p.slot, cardIdx: p.cardIdx })),
      undealtCount: (match.undealt?.[meIdx] || []).length,
      discardedCount: (match.discarded?.[meIdx] || []).length,
      ready: match.ready[meIdx],
      discardReady: !!match.discardReady?.[meIdx]
    },
    opponent: {
      username: match.usernames[oppIdx],
      goalColor: match.goalColor[oppIdx],
      goalCard: { name: match.deckOrder[oppIdx][11].name, assetPath: match.deckOrder[oppIdx][11].assetPath, color: match.deckOrder[oppIdx][11].color },
      swapUsed: match.swapUsed[oppIdx],
      revealed: match.revealed[oppIdx],
      handCount: (match.hand?.[oppIdx] || []).length,
      // Only WHICH slots the opponent has committed to (shown face down) — never which cards,
      // and nothing at all until they commit.
      committedSlots: match.ready[oppIdx] ? oppPlacements.map(p => p.slot) : [],
      ready: match.ready[oppIdx],
      discardReady: !!match.discardReady?.[oppIdx]
    }
  }
}

/* ── Player actions (shared validation; callers own transport, points and persistence) ───── */

const bad = (code, message) => ({ ok: false, code, message })
const OK = { ok: true }

function actionable(match, idx) {
  if (match.ending) return bad('over', 'The match is over.')
  if (match.phase !== 'play') return bad('wrongPhase', 'Not the placing phase.')
  if (match.ready[idx]) return bad('already_committed', 'You already committed this round.')
  return null
}

/**
 * Places hand card `cardIdx` into `slot` (one of this round's slots). If the card is already
 * placed it moves; a card already in the target slot goes back to the hand.
 */
export function placeCard(match, idx, { cardIdx, slot } = {}) {
  const blocked = actionable(match, idx)
  if (blocked) return blocked
  if (!Number.isInteger(cardIdx) || !match.hand[idx].includes(cardIdx)) return bad('badCard', 'That card is not in your hand.')
  const slots = slotsForRound(match.currentRound)
  if (!Number.isInteger(slot) || !slots.includes(slot)) return bad('badSlot', 'That slot is not open this round.')
  const next = match.placements[idx].filter(p => p.cardIdx !== cardIdx && p.slot !== slot)
  next.push({ slot, cardIdx })
  match.placements[idx] = next.sort((a, b) => a.slot - b.slot)
  return OK
}

export function unplaceSlot(match, idx, { slot } = {}) {
  const blocked = actionable(match, idx)
  if (blocked) return blocked
  match.placements[idx] = match.placements[idx].filter(p => p.slot !== slot)
  return OK
}

/** Whether `idx` may commit now. Sudden death needs exactly one card; regulation allows 0..max. */
export function checkCommit(match, idx, round) {
  if (match.ending) return bad('over', 'The match is over.')
  if (Number(round) !== match.currentRound) return bad('staleRound', 'Round changed.')
  if (match.phase !== 'play') return bad('wrongPhase', 'Not the placing phase.')
  if (match.ready[idx]) return bad('already_committed', 'You already committed this round.')
  if (isSuddenDeathRound(match.currentRound) && match.placements[idx].length !== 1) {
    return bad('needCard', 'Place a card to continue sudden death.')
  }
  return OK
}

/** Pre-flight for a swap (PvP validates, then debits points, then applies). */
export function checkSwap(match, idx, { cardIdx } = {}) {
  const blocked = actionable(match, idx)
  if (blocked) return blocked
  if (match.swapUsed[idx]) return bad('swap_used', 'You already used your swap.')
  if (!Number.isInteger(cardIdx) || !match.hand[idx].includes(cardIdx)) return bad('badCard', 'That card is not in your hand.')
  if (match.placements[idx].some(p => p.cardIdx === cardIdx)) return bad('badCard', 'Take that card out of its slot first.')
  if (match.undealt[idx].length === 0) return bad('nothingToSwap', 'There are no undealt cards left to swap with.')
  return OK
}

/** Applies a swap that already passed `checkSwap`. Returns { ok, drawn }. */
export function applyHandSwap(match, idx, { cardIdx } = {}, rng = Math.random) {
  const check = checkSwap(match, idx, { cardIdx })
  if (!check.ok) return check
  const res = swapForRandomUndealt(match.hand[idx], match.undealt[idx], cardIdx, rng)
  match.hand[idx] = res.hand
  match.undealt[idx] = res.undealt
  match.swapUsed[idx] = true
  return { ok: true, drawn: res.drawn }
}

/** Records a player's discards (possibly none) for the discard phase. */
export function submitDiscard(match, idx, { cardIdxs } = {}) {
  if (match.ending) return bad('over', 'The match is over.')
  if (match.phase !== 'discard') return bad('wrongPhase', 'Not the discard phase.')
  if (match.discardReady[idx]) return bad('already_discarded', 'You already finished discarding.')
  const list = Array.isArray(cardIdxs) ? cardIdxs : []
  if (!list.every(Number.isInteger)) return bad('badCard', 'Invalid discard.')
  let res
  try { res = discardAndDeal(match.hand[idx], [], list) } catch { return bad('badCard', 'Invalid discard.') }
  // Hold the discards until both sides are done so the deal is simultaneous.
  match.pendingDiscard = match.pendingDiscard || [[], []]
  match.pendingDiscard[idx] = res.discarded
  match.discardReady[idx] = true
  return OK
}

/**
 * When both players have finished discarding: drop the discards and refill each hand from the
 * undealt cards. Returns true if the phase resolved.
 */
export function resolveDiscardPhase(match) {
  if (match.phase !== 'discard' || !match.discardReady[0] || !match.discardReady[1]) return false
  for (const i of [0, 1]) {
    const res = discardAndDeal(match.hand[i], match.undealt[i], match.pendingDiscard?.[i] || [])
    match.hand[i] = res.hand
    match.undealt[i] = res.undealt
    match.discarded[i] = [...match.discarded[i], ...res.discarded]
  }
  match.pendingDiscard = null
  match.phase = 'play'
  match.discardReady = [false, false]
  return true
}

/** Cards a player can still play: everything in hand plus everything not yet dealt. */
function playableCards(match, idx) {
  return [...match.hand[idx], ...match.undealt[idx]]
}

/** Builds the { revealed, goalCard } shape resolveFinalBoard expects for one side of the match. */
export function finalBoardInputFor(match, idx) {
  return {
    revealed: match.revealed[idx].map(r => ({
      ctoonId: r.ctoonId, name: r.name, characters: r.characters, color: r.color, value: r.baseValue,
      type1: r.type1, type2: r.type2, type3: r.type3, group: r.group,
      isSlam: r.isSlam, effect: r.effect, round: r.round, slot: r.slot
    })),
    goalCard: match.deckOrder[idx][11]
  }
}

/**
 * Runs the ONE full-board effects pass for a (possibly still-tied) completed round 7+, mutating
 * `match.revealed[*][*].finalValue/color` in place with the resolved values so `publicMatchView`
 * naturally reflects final scoring, and returns { outcome, final } for the caller to act on.
 * Safe to call speculatively (e.g. to check whether a tie actually broke) — it does not touch
 * the database or roundLog; only the caller's end-of-match step persists anything.
 */
export function runFinalBoardResolution(match) {
  let final
  try {
    final = resolveFinalBoard({
      player1: finalBoardInputFor(match, 0),
      player2: finalBoardInputFor(match, 1)
    })
  } catch (err) {
    // A malformed admin-authored gtoonEffect must never take the shared socket process down —
    // fall back to plain base values with no effects applied.
    console.error(`[ogGtoons] final board resolution failed for match ${match.id}:`, err)
    final = {
      player1: { revealed: match.revealed[0].map(r => ({ ctoonId: r.ctoonId, round: r.round, baseValue: r.baseValue, finalValue: r.baseValue, color: r.color })), totalValue: 0 },
      player2: { revealed: match.revealed[1].map(r => ({ ctoonId: r.ctoonId, round: r.round, baseValue: r.baseValue, finalValue: r.baseValue, color: r.color })), totalValue: 0 },
      effectsResolved: []
    }
  }
  for (const idx of [0, 1]) {
    const key = idx === 0 ? 'player1' : 'player2'
    final[key].revealed.forEach((r, i) => {
      if (!match.revealed[idx][i]) return
      match.revealed[idx][i].finalValue = r.finalValue
      match.revealed[idx][i].color = r.color
    })
  }
  const outcome = determineWinner({
    player1GoalColor: match.goalColor[0],
    player2GoalColor: match.goalColor[1],
    player1Revealed: final.player1.revealed,
    player2Revealed: final.player2.revealed
  })
  return { outcome, final }
}

function toRevealEntry(card, round, slot) {
  // finalValue === baseValue at reveal time: effects have not been applied yet.
  return {
    ctoonId: card.ctoonId, name: card.name, assetPath: card.assetPath, characters: card.characters,
    color: card.color, baseValue: card.value, finalValue: card.value,
    type1: card.type1, type2: card.type2, type3: card.type3, group: card.group,
    isSlam: card.isSlam, effect: card.effect, round, slot
  }
}

/**
 * Reveals every placed card for the round, in slot order, appending to `match.revealed` (kept
 * sorted by slot), removing them from each hand and clearing both ready flags and placements.
 * The caller must have checked both sides are ready.
 * Returns { entries: [side0Entries, side1Entries], order }, where each entries list is in slot
 * order and `order` is every slot that flipped, ascending (the order the client animates them).
 */
export function revealPlacedCards(match) {
  const entries = [[], []]
  for (const i of [0, 1]) {
    for (const p of match.placements[i]) {
      const card = match.deckOrder[i][p.cardIdx]
      const entry = toRevealEntry(card, match.currentRound, p.slot)
      entries[i].push(entry)
      match.revealed[i].push(entry)
    }
    const placed = new Set(match.placements[i].map(p => p.cardIdx))
    match.hand[i] = match.hand[i].filter(c => !placed.has(c))
    match.revealed[i].sort((a, b) => a.slot - b.slot)
    match.placements[i] = []
  }
  match.ready = [false, false]
  const order = [...new Set([...entries[0], ...entries[1]].map(e => e.slot))].sort((a, b) => a - b)
  return { entries, order }
}

/**
 * Moves the match on after a reveal that did NOT end it: bumps the round, then either opens the
 * discard phase (after round 1) or, in sudden death, deals out the undealt cards so a player can
 * choose from everything they have left.
 */
export function advanceRound(match) {
  const justPlayed = match.currentRound
  match.currentRound += 1
  if (justPlayed === DISCARD_AFTER_ROUND) {
    match.phase = 'discard'
    match.discardReady = [false, false]
    match.pendingDiscard = null
  } else {
    match.phase = 'play'
    if (isSuddenDeathRound(match.currentRound)) {
      for (const i of [0, 1]) {
        match.hand[i] = [...match.hand[i], ...match.undealt[i]]
        match.undealt[i] = []
      }
    }
  }
}

/**
 * After a reveal: decides whether the match is over. After the last regulation round, and every
 * sudden-death round after that, runs the ONE full-board effects pass to see whether the tie
 * actually breaks (a Slam gToon effect can turn an apparent base-value tie into a real result) —
 * only a genuine tie with playable cards on both sides continues into another sudden-death round.
 * Returns null to keep playing, or the end-of-match params.
 */
export function checkMatchEnd(match) {
  if (match.currentRound < TOTAL_ROUNDS) return null
  const { outcome, final } = runFinalBoardResolution(match)
  const bothHaveCards = hasSuddenDeathCardsRemaining(playableCards(match, 0)) &&
    hasSuddenDeathCardsRemaining(playableCards(match, 1))
  if (outcome.winner === null && bothHaveCards) return null
  return {
    outcome: outcome.winner === null ? 'TIE' : (outcome.winner === 'player1' ? 'PLAYER1' : 'PLAYER2'),
    winnerIdx: outcome.winner ? (outcome.winner === 'player1' ? 0 : 1) : null,
    player1Score: outcome.player1Score,
    player2Score: outcome.player2Score,
    effectsResolved: final.effectsResolved
  }
}

/**
 * Builds the match's roundLog — WRITTEN ONCE, at match completion (never per-round). One row per
 * board slot that was filled by either side, in slot order. By the time this runs,
 * `match.revealed[*][*].finalValue/color` already reflect the one full-board effects pass if the
 * match reached that point naturally; a match ended early (forfeit/sweep) simply logs base values
 * with an empty effectsResolved.
 */
export function buildRoundLog(match, effectsResolved) {
  const slots = [...new Set([...match.revealed[0], ...match.revealed[1]].map(r => r.slot))].sort((a, b) => a - b)
  const rounds = slots.map(slot => {
    const r1 = match.revealed[0].find(r => r.slot === slot) || null
    const r2 = match.revealed[1].find(r => r.slot === slot) || null
    return {
      round: r1?.round ?? r2?.round ?? null,
      slot,
      player1: r1 ? { ctoonId: r1.ctoonId, name: r1.name, baseValue: r1.baseValue, finalValue: r1.finalValue, color: r1.color } : null,
      player2: r2 ? { ctoonId: r2.ctoonId, name: r2.name, baseValue: r2.baseValue, finalValue: r2.finalValue, color: r2.color } : null
    }
  })
  return { rounds, effectsResolved: effectsResolved || [] }
}
