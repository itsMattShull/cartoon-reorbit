// server/utils/ogGtoonMatchCore.js
//
// Match-state logic shared by original gToons (2002) PvP (ogGtoonsSocket.js) and Practice mode
// (ogGtoonsPractice.js). Everything here operates on a plain `match` object and never touches
// Prisma, Socket.IO, Redis or points — so both modes resolve rounds, scoring and the public
// per-player view with literally the same code and cannot drift apart, while the parts that DO
// differ (stakes, swap cost, persistence, matchmaking) stay in the module that owns them.
//
// Match shape (index 0 / 1 = player 1 / player 2):
//   { id, players, usernames, deckOrder, remainingIdx, goalColor, swapUsed, ready, revealed,
//     stake, currentRound, practice? }

import { resolveFinalBoard } from './ogGtoonEffects.js'
import { determineWinner, hasSuddenDeathCardsRemaining } from './ogGtoonEngine.js'

export const TOTAL_ROUNDS = 7

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

export function publicMatchView(match, uid) {
  const meIdx = match.players.indexOf(uid)
  const oppIdx = meIdx === 0 ? 1 : 0
  return {
    matchId: match.id,
    round: match.currentRound,
    totalRounds: TOTAL_ROUNDS,
    suddenDeath: match.currentRound > TOTAL_ROUNDS,
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
      cardsRemaining: match.remainingIdx[meIdx].length,
      ready: match.ready[meIdx],
      // The up-next card's identity is NEVER sent to the opponent, and is only sent to its own
      // owner once committed — see the reveal payload. Before that it is just "count remaining".
    },
    opponent: {
      username: match.usernames[oppIdx],
      goalColor: match.goalColor[oppIdx],
      goalCard: { name: match.deckOrder[oppIdx][11].name, assetPath: match.deckOrder[oppIdx][11].assetPath, color: match.deckOrder[oppIdx][11].color },
      swapUsed: match.swapUsed[oppIdx],
      revealed: match.revealed[oppIdx],
      cardsRemaining: match.remainingIdx[oppIdx].length,
      ready: match.ready[oppIdx]
    }
  }
}

/** Builds the { revealed, goalCard } shape resolveFinalBoard expects for one side of the match. */
export function finalBoardInputFor(match, idx) {
  return {
    revealed: match.revealed[idx].map(r => ({
      ctoonId: r.ctoonId, name: r.name, characters: r.characters, color: r.color, value: r.baseValue,
      type1: r.type1, type2: r.type2, type3: r.type3, group: r.group,
      isSlam: r.isSlam, effect: r.effect, round: r.round
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

function toRevealEntry(card, round) {
  // finalValue === baseValue at reveal time: effects have not been applied yet.
  return {
    ctoonId: card.ctoonId, name: card.name, assetPath: card.assetPath, characters: card.characters,
    color: card.color, baseValue: card.value, finalValue: card.value,
    type1: card.type1, type2: card.type2, type3: card.type3, group: card.group,
    isSlam: card.isSlam, effect: card.effect, round
  }
}

/**
 * Pops each side's up-next card, appends its reveal entry to `match.revealed`, and clears both
 * ready flags. Returns the two entries. The caller must have checked both sides are ready.
 */
export function revealNextCards(match) {
  const idx0 = match.remainingIdx[0][0]
  const idx1 = match.remainingIdx[1][0]
  const card1 = match.deckOrder[0][idx0]
  const card2 = match.deckOrder[1][idx1]

  match.remainingIdx[0] = match.remainingIdx[0].slice(1)
  match.remainingIdx[1] = match.remainingIdx[1].slice(1)

  const entry1 = toRevealEntry(card1, match.currentRound)
  const entry2 = toRevealEntry(card2, match.currentRound)
  match.revealed[0].push(entry1)
  match.revealed[1].push(entry2)
  match.ready = [false, false]
  return { entry1, entry2 }
}

/**
 * After a reveal: decides whether the match is over. After round 7, and every sudden-death round
 * after that, runs the ONE full-board effects pass to see whether the tie actually breaks (a Slam
 * gToon effect can turn an apparent base-value tie into a real result) — only a genuine tie with
 * cards remaining on both sides continues into another sudden-death round.
 * Returns null to keep playing, or the end-of-match params.
 */
export function checkMatchEnd(match) {
  if (match.currentRound < TOTAL_ROUNDS) return null
  const { outcome, final } = runFinalBoardResolution(match)
  const bothHaveCards = hasSuddenDeathCardsRemaining(match.remainingIdx[0]) &&
    hasSuddenDeathCardsRemaining(match.remainingIdx[1])
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
 * Builds the match's roundLog — WRITTEN ONCE, at match completion (never per-round). By the time
 * this runs, `match.revealed[*][*].finalValue/color` already reflect the one full-board effects
 * pass if the match reached that point naturally; a match ended early (forfeit/sweep) simply
 * logs base values with an empty effectsResolved.
 */
export function buildRoundLog(match, effectsResolved) {
  const n = Math.max(match.revealed[0].length, match.revealed[1].length)
  const rounds = []
  for (let i = 0; i < n; i++) {
    const r1 = match.revealed[0][i] || null
    const r2 = match.revealed[1][i] || null
    rounds.push({
      round: r1?.round ?? r2?.round ?? i + 1,
      player1: r1 ? { ctoonId: r1.ctoonId, name: r1.name, baseValue: r1.baseValue, finalValue: r1.finalValue, color: r1.color } : null,
      player2: r2 ? { ctoonId: r2.ctoonId, name: r2.name, baseValue: r2.baseValue, finalValue: r2.finalValue, color: r2.color } : null
    })
  }
  return { rounds, effectsResolved: effectsResolved || [] }
}
