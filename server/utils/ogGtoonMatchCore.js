// server/utils/ogGtoonMatchCore.js
//
// Match-state logic shared by original gToons (2002) PvP (ogGtoonsSocket.js) and Practice mode
// (ogGtoonsPractice.js). Everything here operates on a plain `match` object and never touches
// Prisma, Socket.IO, Redis or points — so both modes resolve rounds, scoring and the public
// per-player view with literally the same code and cannot drift apart, while the parts that DO
// differ (stakes, swap cost, persistence, matchmaking) stay in the module that owns them.
//
// Match shape (index 0 / 1 = player 1 / player 2):
//   { id, players, usernames, deckOrder, goalColor, goalCardIdx, swapUsed, ready, revealed, stake,
//     currentRound, practice?,
//     hand,        // [[deckIdx...], [deckIdx...]]  cards each player holds (private to them)
//     undealt,     // [[deckIdx...], [deckIdx...]]  not yet dealt (private; the discard-phase draw)
//     discarded,   // [[deckIdx...], [deckIdx...]]  out of the match
//     placements,  // [[{slot, cardIdx}...], ...]   this round's placements, not yet revealed
//     phase,       // 'play' | 'discard' | 'swap' | 'color'
//     discardReady // [bool, bool] during the discard phase
//     swapReady,   // [bool, bool] during the round-3 slot-7 swap phase
//     pendingSwap, // [bool, bool] who asked to swap (applied together once both are ready)
//     colorReady,  // [bool, bool] during the end-of-game Silver colour phase
//     pendingColor,// [string|null, ...] held picks, applied together once both are ready
//     silverColor, // [string|null, ...] the colour each player's Silver cards count as (once picked)
//     colorDone,   // true once the colour phase has run (it runs once, before first scoring)
//     deadline     // epoch ms when the current phase times out }
// See ogGtoonEngine.js's header for the hand/slot rules.

import { sanitizeGtoonCardStyle } from '../../utils/gtoonCardStyle.js'
import { revealDurationMs } from '../../utils/ogGtoonReveal.js'
import { resolveFinalBoard } from './ogGtoonEffects.js'
import {
  determineWinner, recolorSilver, isRealColor, REAL_COLORS, COLOR_MS, hasSuddenDeathCardsRemaining, dealOpeningHand, discardAndDeal,
  goalCardFor, targetColorsOf, slotsForRound, isSuddenDeathRound, shuffled, REGULATION_ROUNDS, DISCARD_AFTER_ROUND,
  SWAP_AFTER_ROUND, PLACE_MS, DISCARD_MS, SWAP_MS
} from './ogGtoonEngine.js'

export const TOTAL_ROUNDS = REGULATION_ROUNDS

/* ── Game log ────────────────────────────────────────────────────────────────────────────────
 * One ordered, append-only log per match, shown to both players while the game runs and again at
 * the end (and saved with the match). It only ever contains what both players could see: names,
 * revealed cards, who committed, timeouts, discard/draw COUNTS (never which cards), swap results
 * and — after each reveal and at final scoring — exactly what every power is doing, what is NOT
 * applying because its source was knocked out or cancelled, and what that changed.
 * Entry: { seq, at, round, kind, title, sections: [{ label|null, lines: string[] }], data? } */

export function logEvent(match, { kind, title, sections = [], data = null }) {
  if (!Array.isArray(match.gameLog)) match.gameLog = []
  match.gameLog.push({
    seq: match.gameLog.length + 1, at: Date.now(), round: match.currentRound ?? null,
    kind, title, sections: sections.filter(sec => sec.lines.length), ...(data ? { data } : {})
  })
}

const nameOfSide = (match, idx) => match.usernames?.[idx] ?? `Player ${idx + 1}`
const sideIdx = (side) => (side === 'player1' ? 0 : 1)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const COLOR_WORD = (c) => (c ? c.charAt(0) + c.slice(1).toLowerCase() : '?')
const targetWord = (c) => (isRealColor(c) ? COLOR_WORD(c) : 'none')
function targetSummary(goalColors) {
  const t = targetColorsOf(goalColors)
  if (t.length === 2) return `Two target colors revealed (${t.map(COLOR_WORD).join(' and ')}): the most cards of both colors combined wins the game regardless of points. A tie is broken by points.`
  if (t.length === 1) return `One target color revealed (${COLOR_WORD(t[0])}): decided by points; more ${COLOR_WORD(t[0])} cards earns a 15 point bonus.`
  return 'No target color revealed: decided by points only.'
}
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`)

function describeApplication(e) {
  if (e.action === 'setColor') return `recolors it ${COLOR_WORD(e.color)}`
  if (e.operation === 'multiply') return `×${e.amount}`
  if (e.operation === 'set') return `sets it to ${e.amount}`
  return signed(e.amount)
}

/** Turns a resolveFinalBoard analysis into log sections + card markers. */
function describeBoard(match, final, { includeApplied = true } = {}) {
  const a = final.analysis
  const who = (side, name) => `${name} (${nameOfSide(match, sideIdx(side))})`
  const byCtoon = new Map()
  for (const side of [0, 1]) for (const r of match.revealed[side]) byCtoon.set(r.ctoonId, r.name)
  const nm = (id) => byCtoon.get(id) ?? id
  const knockText = (c) => (c.kind === 'sameCharacter'
    ? `same character (${c.character}) — only the lower value counts, ${who(c.by.side, c.by.name ?? nm(c.by.ctoonId))} (${c.by.value}) is lower`
    : 'the same gToon is in play more than once')
  const causeText = (causes) => (causes || []).map(c => (c.kind === 'duplicate' || c.kind === 'sameCharacter'
    ? knockText(c) : `cancelled by ${who(c.by.side, c.by.name)}`)).join(' and ')

  const knocked = a.knockedOut.map(k => `${who(k.side, k.name)} — ${knockText(k.cause || { kind: 'duplicate' })}: scores 0 and its powers are off.`)
  const cancelled = a.negated.map(n => `${who(n.side, n.name)} — ${causeText(n.causes)}.`)
  const lost = a.lostEffects.map(l => {
    const self = l.source === l.targetPlayer && l.sourceIndex === l.targetIndex
    return `${who(l.source, nm(l.sourceCtoonId))}'s ${describeApplication(l)} on ${self ? 'itself' : who(l.targetPlayer, nm(l.targetCtoonId))} — ${causeText(l.causes)}.`
  })
  const changed = a.changes.map(c => {
    const parts = []
    if (c.fromValue !== c.toValue) parts.push(`${c.fromValue} → ${c.toValue}`)
    if (c.fromColor !== c.toColor) parts.push(`${COLOR_WORD(c.fromColor)} → ${COLOR_WORD(c.toColor)}`)
    const why = [...new Set(c.reasons.map(r => (r.kind === 'duplicate' || r.kind === 'sameCharacter'
      ? 'knocked out' : `lost ${r.sourceCtoonId === c.ctoonId ? 'its own' : `${nm(r.sourceCtoonId)}'s`} ${describeApplication(r)}`)))]
    return `${who(c.side, c.name)}: ${parts.join(', ')}${why.length ? ` (${why.join('; ')})` : ' (knock-on effect)'}`
  })
  const applied = includeApplied
    ? final.effectsResolved.filter(e => e.action === 'modifyValue' || e.action === 'setColor')
      .map(e => `${who(e.source, nm(e.sourceCtoonId))} → ${who(e.targetPlayer, nm(e.targetCtoonId))}: ${describeApplication(e)}`)
    : []
  const sections = [
    { label: 'Knocked out', lines: knocked },
    { label: 'Powers cancelled', lines: cancelled },
    { label: 'No longer applying', lines: lost },
    { label: 'What changed', lines: changed },
    { label: 'Powers in effect', lines: applied }
  ]
  const markers = []
  for (const k of a.knockedOut) markers.push({ side: sideIdx(k.side), slot: k.slot, kind: 'knockedOut' })
  for (const n of a.negated) markers.push({ side: sideIdx(n.side), slot: n.slot, kind: 'cancelled' })
  for (const c of a.changes) if (!c.cancelled) markers.push({ side: sideIdx(c.side), slot: c.slot, kind: 'changed', from: c.fromValue, to: c.toValue })
  return { sections, markers, notable: knocked.length + cancelled.length + lost.length + changed.length > 0 }
}

/** Builds an immutable per-card snapshot embedding everything round/final-board resolution ever needs. */
export function toSnapshotCard(ctoon, position) {
  return {
    ctoonId: ctoon.id,
    name: ctoon.name,
    assetPath: ctoon.assetPath,
    characters: Array.isArray(ctoon.characters) ? ctoon.characters : [],
    color: ctoon.gtoonColor,
    cardStyle: sanitizeGtoonCardStyle(ctoon.gtoonCardStyle),
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
  match.gameLog = []
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
  match.swapReady = [false, false]
  match.pendingSwap = [false, false]
  match.colorReady = [false, false]
  match.pendingColor = [null, null]
  match.silverColor = [null, null]
  match.colorDone = false
  match.revealed = [[], []]
  match.currentRound = 1
  logEvent(match, {
    kind: 'start', title: 'Match started',
    sections: [{ label: null, lines: [
      `${nameOfSide(match, 0)} (target ${targetWord(match.goalColor?.[0])}) vs ${nameOfSide(match, 1)} (target ${targetWord(match.goalColor?.[1])})`,
      targetSummary(match.goalColor),
      'Each player was dealt 6 cards from their 12-card deck.'
    ] }]
  })
  startPhaseClock(match)
  return match
}

function goalCardView(match, idx) {
  const c = goalCardFor(match, idx)
  if (!c) return null
  return { ctoonId: c.ctoonId, name: c.name, assetPath: c.assetPath, color: c.color, cardStyle: c.cardStyle, value: c.value }
}

/* ── Phase clock ───────────────────────────────────────────────────────────────────────────── */

export function phaseDurationMs(match) {
  if (match.phase === 'discard') return DISCARD_MS
  if (match.phase === 'swap') return SWAP_MS
  if (match.phase === 'color') return COLOR_MS
  return PLACE_MS
}

/** Stamps the deadline for the phase the match just entered. */
export function startPhaseClock(match, now = Date.now()) {
  match.deadline = now + phaseDurationMs(match)
  const secs = Math.round(phaseDurationMs(match) / 1000)
  if (match.phase === 'discard') {
    logEvent(match, { kind: 'phase', title: 'Discard phase', sections: [{ label: null, lines: [`Throw away any cards you don't want; hands refill to 6. ${secs}s (no discards if time runs out).`] }] })
  } else if (match.phase === 'color') {
    logEvent(match, { kind: 'phase', title: 'Silver colour', sections: [{ label: null, lines: [
      `Silver cards are colourless. Pick the colour your Silver cards count as. ${secs}s (the best colour is picked for you if time runs out).`
    ] }] })
  } else if (match.phase === 'swap') {
    logEvent(match, { kind: 'phase', title: 'Round 3 — slot-7 swap', sections: [{ label: null, lines: [
      `Optional: replace your slot-7 card with a random undealt card (${match.practice ? 'free in practice' : '10 points'}). ${secs}s (no swap if time runs out).`
    ] }] })
  } else {
    const slots = slotsForRound(match.currentRound)
    const range = slots.length === 1 ? `slot ${slots[0]}` : `slots ${slots[0]}–${slots[slots.length - 1]}`
    logEvent(match, { kind: 'phase', title: isSuddenDeathRound(match.currentRound) ? 'Sudden death' : `Round ${match.currentRound}`, sections: [{ label: null, lines: [
      `Fill ${range} with ${plural(slots.length, 'card')}. ${secs}s (random cards are placed if time runs out).`
    ] }] })
  }
}

/** A card as the OWNER sees it in their hand — never sent to the opponent. */
function handCardView(match, meIdx, deckIdx) {
  const c = match.deckOrder[meIdx][deckIdx]
  return {
    idx: deckIdx, ctoonId: c.ctoonId, name: c.name, assetPath: c.assetPath, color: c.color, cardStyle: c.cardStyle,
    value: c.value, type1: c.type1, type2: c.type2, type3: c.type3, group: c.group
  }
}

/** `opts.log === false` leaves the (large, rarely changing) game log out of high-frequency updates. */
export function publicMatchView(match, uid, opts = {}) {
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
    phaseEndsAt: match.deadline || null,
    ...(opts.log === false ? {} : { gameLog: match.gameLog || [] }),
    // The latest resolved board ({ cards:[{side,slot,finalValue,color,cancelled}], totals, markers }), so values
    // stay correct between rounds / after a reconnect. null until the first card has been revealed.
    board: match.liveBoard || null,
    // Slots the current round may fill, and how many cards may go in them.
    roundSlots: slots,
    // Only present on practice matches, so PvP payloads are unchanged.
    ...(match.practice ? { practice: true, difficulty: match.difficulty } : {}),
    you: {
      sideIndex: meIdx,
      userId: uid,
      username: match.usernames[meIdx],
      goalColor: match.goalColor[meIdx],
      goalCard: goalCardView(match, meIdx),
      swapUsed: match.swapUsed[meIdx],
      stake: match.stake[meIdx],
      revealed: match.revealed[meIdx],
      // Private: the owner always sees their own hand and where they have placed cards.
      hand: (match.hand?.[meIdx] || []).map(i => handCardView(match, meIdx, i)),
      placements: myPlacements.map(p => ({ slot: p.slot, cardIdx: p.cardIdx })),
      undealtCount: (match.undealt?.[meIdx] || []).length,
      discardedCount: (match.discarded?.[meIdx] || []).length,
      ready: match.ready[meIdx],
      discardReady: !!match.discardReady?.[meIdx],
      swapReady: !!match.swapReady?.[meIdx],
      colorReady: !!match.colorReady?.[meIdx],
      mayChooseColor: match.phase === 'color' && !match.colorReady?.[meIdx],
      hasSilver: hasSilver(match, meIdx),
      // Private until the colour phase resolves; then both picks are public.
      silverColor: match.silverColor?.[meIdx] ?? null,
      pendingColor: match.pendingColor?.[meIdx] ?? null,
      maySwap: match.phase === 'swap' && !match.swapReady?.[meIdx] && (match.undealt?.[meIdx] || []).length > 0
    },
    opponent: {
      username: match.usernames[oppIdx],
      goalColor: match.goalColor[oppIdx],
      goalCard: goalCardView(match, oppIdx),
      swapUsed: match.swapUsed[oppIdx],
      revealed: match.revealed[oppIdx],
      handCount: (match.hand?.[oppIdx] || []).length,
      // Only WHICH slots the opponent has committed to (shown face down) — never which cards,
      // and nothing at all until they commit.
      committedSlots: match.ready[oppIdx] ? oppPlacements.map(p => p.slot) : [],
      ready: match.ready[oppIdx],
      discardReady: !!match.discardReady?.[oppIdx],
      swapReady: !!match.swapReady?.[oppIdx],
      colorReady: !!match.colorReady?.[oppIdx],
      silverColor: match.silverColor?.[oppIdx] ?? null
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

/** Marks `idx` as committed for the round (after `checkCommit` passed) and logs it. */
export function markCommitted(match, idx) {
  match.ready[idx] = true
  logEvent(match, { kind: 'commit', title: 'Committed', sections: [{ label: null, lines: [`${nameOfSide(match, idx)} committed their cards.`] }] })
}

/** Logs a match that ended some way other than scoring (forfeit, timeout). */
export function logAbnormalEnd(match, text) {
  logEvent(match, { kind: 'end', title: 'Match ended', sections: [{ label: null, lines: [text] }] })
}

/** How many cards `idx` must place this round: every open slot (capped by what they hold). */
export function requiredPlacements(match, idx) {
  return Math.min(slotsForRound(match.currentRound).length, (match.hand[idx] || []).length)
}

/** Whether `idx` may commit now: every open slot must hold a card. */
export function checkCommit(match, idx, round) {
  if (match.ending) return bad('over', 'The match is over.')
  if (Number(round) !== match.currentRound) return bad('staleRound', 'Round changed.')
  if (match.phase !== 'play') return bad('wrongPhase', 'Not the placing phase.')
  if (match.ready[idx]) return bad('already_committed', 'You already committed this round.')
  const need = requiredPlacements(match, idx)
  if (match.placements[idx].length !== need) {
    return bad('needCards', `Fill every open slot (${need}) before committing.`)
  }
  return OK
}

/**
 * Fills `idx`'s empty open slots with random unplaced hand cards (the timeout default). Cards the
 * player already placed stay where they are.
 */
export function autoFillPlacements(match, idx, rng = Math.random) {
  const open = slotsForRound(match.currentRound)
  const taken = new Set(match.placements[idx].map(p => p.slot))
  const used = new Set(match.placements[idx].map(p => p.cardIdx))
  const free = shuffled(match.hand[idx].filter(c => !used.has(c)), rng)
  for (const slot of open) {
    if (taken.has(slot)) continue
    if (!free.length) break
    match.placements[idx].push({ slot, cardIdx: free.pop() })
  }
  match.placements[idx].sort((a, b) => a.slot - b.slot)
}

/* ── Round-3 slot-7 swap ─────────────────────────────────────────────────────────────────── */

/** The revealed entry sitting in the last regulation slot for side `idx`, if any. */
function slotSevenEntry(match, idx) {
  return match.revealed[idx].find(r => r.slot === 7) || null
}

/** Whether `idx` can be offered the swap at all: a card in slot 7 and an undealt card to draw. */
function canOfferSwap(match, idx) {
  return !!slotSevenEntry(match, idx) && (match.undealt[idx] || []).length > 0
}

/** Pre-flight for the slot-7 swap (PvP validates, then debits points, then records it). */
export function checkSwap(match, idx) {
  if (match.ending) return bad('over', 'The match is over.')
  if (match.phase !== 'swap') return bad('wrongPhase', 'Not the swap phase.')
  if (match.swapReady[idx]) return bad('already_swapped', 'You already made your swap choice.')
  if (!canOfferSwap(match, idx)) return bad('nothingToSwap', 'There are no undealt cards left to swap with.')
  return OK
}

/** Records a player's choice for the swap phase: `swap` true = replace slot 7, false = skip. */
export function recordSwapChoice(match, idx, swap) {
  if (match.ending) return bad('over', 'The match is over.')
  if (match.phase !== 'swap') return bad('wrongPhase', 'Not the swap phase.')
  if (match.swapReady[idx]) return bad('already_swapped', 'You already made your swap choice.')
  if (swap && !canOfferSwap(match, idx)) return bad('nothingToSwap', 'There are no undealt cards left to swap with.')
  match.pendingSwap[idx] = !!swap
  match.swapReady[idx] = true
  return OK
}

/**
 * Once both sides have chosen: applies the swaps together. The slot-7 card goes back into the
 * undealt pile and a random undealt card takes its place (revealed as a round-3 entry).
 * Returns null while someone is still deciding, else { entries, order } shaped like a reveal
 * (entries only for the sides that swapped).
 */
export function resolveSwapPhase(match, rng = Math.random) {
  if (match.phase !== 'swap' || !match.swapReady[0] || !match.swapReady[1]) return null
  const entries = [[], []]
  const swapped = [null, null]
  for (const i of [0, 1]) {
    if (!match.pendingSwap[i]) continue
    const old = slotSevenEntry(match, i)
    swapped[i] = old
    if (!old || !match.undealt[i].length) continue
    const pick = Math.floor(rng() * match.undealt[i].length)
    const drawnIdx = match.undealt[i][pick]
    match.undealt[i] = match.undealt[i].slice()
    match.undealt[i][pick] = old.deckIdx
    const entry = toRevealEntry(match.deckOrder[i][drawnIdx], match.currentRound, old.slot, drawnIdx)
    match.revealed[i] = match.revealed[i].map(r => (r === old ? entry : r))
    entries[i].push(entry)
    match.swapUsed[i] = true
  }
  const lines = []
  for (const i of [0, 1]) {
    if (entries[i].length) {
      const was = swapped[i]
      lines.push(`${nameOfSide(match, i)} swapped slot 7: ${was.name} → ${entries[i][0].name}`)
    } else if (match.revealed[i].some(r => r.slot === 7)) {
      lines.push(`${nameOfSide(match, i)} kept their slot-7 card.`)
    }
  }
  logEvent(match, { kind: 'swap', title: 'Slot-7 swap', sections: [{ label: null, lines }] })
  match.pendingSwap = [false, false]
  match.swapReady = [false, false]
  match.phase = 'play' // the caller either ends the match or advances into sudden death
  const order = [...new Set([...entries[0], ...entries[1]].map(e => e.slot))].sort((a, b) => a - b)
  return { entries, order, ...buildRevealSteps(match, entries) }
}

/**
 * Applies the timeout default for every player still undecided in the current phase: random cards
 * fill their empty slots (and commit), no discards, no swap. Returns the player indexes acted for.
 */
export function expirePhase(match, rng = Math.random) {
  const acted = []
  if (match.ending) return acted
  for (const i of [0, 1]) {
    if (match.phase === 'play' && !match.ready[i]) {
      autoFillPlacements(match, i, rng)
      match.ready[i] = true
      logEvent(match, { kind: 'timeout', title: 'Out of time', sections: [{ label: null, lines: [`${nameOfSide(match, i)} ran out of time — random cards filled their empty slots and were committed.`] }] })
      acted.push(i)
    } else if (match.phase === 'discard' && !match.discardReady[i]) {
      if (submitDiscard(match, i, { cardIdxs: [] }).ok) {
        logEvent(match, { kind: 'timeout', title: 'Out of time', sections: [{ label: null, lines: [`${nameOfSide(match, i)} ran out of time — kept their hand.`] }] })
        acted.push(i)
      }
    } else if (match.phase === 'swap' && !match.swapReady[i]) {
      if (recordSwapChoice(match, i, false).ok) {
        logEvent(match, { kind: 'timeout', title: 'Out of time', sections: [{ label: null, lines: [`${nameOfSide(match, i)} ran out of time — no swap.`] }] })
        acted.push(i)
      }
    } else if (match.phase === 'color' && !match.colorReady[i]) {
      const color = autoSilverColor(match, i)
      if (submitColor(match, i, { color }).ok) {
        logEvent(match, { kind: 'timeout', title: 'Out of time', sections: [{ label: null, lines: [`${nameOfSide(match, i)} ran out of time — their best colour was picked for their Silver cards.`] }] })
        acted.push(i)
      }
    }
  }
  return acted
}

/* ── End-of-game Silver colour phase ────────────────────────────────────────────────────────
 * Silver cards are colourless. Once the regulation board is complete (after the slot-7 swap) every
 * player holding a Silver card picks a real colour; their Silver cards then count as that colour
 * for the goal-colour counts. Picks are held until both sides are done so neither sees the other's
 * first. A player with no Silver card is marked done up front. The phase runs once; a Silver card
 * that only arrives in sudden death counts as the owner's best colour at that point. */

export function hasSilver(match, idx) {
  return (match.revealed?.[idx] || []).some(r => (r.baseColor ?? r.color) === 'SILVER')
}

function resolveBoardSafe(match) {
  try {
    return resolveFinalBoard({ player1: finalBoardInputFor(match, 0), player2: finalBoardInputFor(match, 1) })
  } catch {
    return null
  }
}

/**
 * The colour that gives `idx` the best result with the board as it stands, assuming the opponent's
 * Silver cards count as their own goal colour (unless they have already picked). Only the two goal
 * colours can change a count, so only those are tried; ties favour the player's own goal colour.
 */
export function autoSilverColor(match, idx) {
  const opp = idx === 0 ? 1 : 0
  const own = isRealColor(match.goalColor?.[idx]) ? match.goalColor[idx] : null
  const theirs = isRealColor(match.goalColor?.[opp]) ? match.goalColor[opp] : null
  const candidates = [...new Set([own, theirs].filter(Boolean))]
  if (!candidates.length) return REAL_COLORS[0]
  const final = candidates.length > 1 ? resolveBoardSafe(match) : null
  if (!final) return candidates[0]
  const oppSilver = match.silverColor?.[opp] ?? match.pendingColor?.[opp] ?? (theirs || own)
  let best = null
  for (const color of candidates) {
    const silvers = idx === 0 ? [color, oppSilver] : [oppSilver, color]
    const o = determineWinner({
      player1GoalColor: match.goalColor[0], player2GoalColor: match.goalColor[1],
      player1Revealed: final.player1.revealed, player2Revealed: final.player2.revealed,
      player1SilverColor: silvers[0], player2SilverColor: silvers[1]
    })
    const mine = idx === 0 ? o.player1Score : o.player2Score
    const other = idx === 0 ? o.player2Score : o.player1Score
    const result = o.winner === null ? 1 : ((o.winner === 'player1') === (idx === 0) ? 2 : 0)
    const rank = result * 10000 + (mine - other)
    if (best === null || rank > best.rank) best = { color, rank }
  }
  return best.color
}

/**
 * Opens the colour phase if the board is complete, someone has a Silver card and it has not run
 * yet. Returns true if the match is now in the colour phase (the caller must not score yet).
 */
export function enterColorPhase(match) {
  if (match.ending || match.colorDone || match.currentRound < TOTAL_ROUNDS) return false
  match.colorDone = true
  const need = [hasSilver(match, 0), hasSilver(match, 1)]
  if (!need[0] && !need[1]) return false
  match.phase = 'color'
  match.colorReady = [!need[0], !need[1]]
  match.pendingColor = [null, null]
  startPhaseClock(match)
  return true
}

/** Records a player's Silver colour pick for the colour phase. */
export function submitColor(match, idx, { color } = {}) {
  if (match.ending) return bad('over', 'The match is over.')
  if (match.phase !== 'color') return bad('wrongPhase', 'Not the colour phase.')
  if (match.colorReady[idx]) return bad('already_chosen', 'You already chose a colour.')
  if (!isRealColor(color)) return bad('badColor', 'Pick a real colour (not Black or Silver).')
  match.pendingColor[idx] = color
  match.colorReady[idx] = true
  return OK
}

/**
 * Once both sides are done: applies the picks together and returns true. The caller then scores
 * the board (and advances into sudden death on a tie) exactly as after a swap.
 */
export function resolveColorPhase(match) {
  if (match.phase !== 'color' || !match.colorReady[0] || !match.colorReady[1]) return false
  const lines = []
  for (const i of [0, 1]) {
    const picked = match.pendingColor?.[i] ?? null
    match.silverColor[i] = picked
    if (picked) lines.push(`${nameOfSide(match, i)}'s Silver cards count as ${COLOR_WORD(picked)}.`)
  }
  logEvent(match, { kind: 'color', title: 'Silver colours revealed', sections: [{ label: null, lines }] })
  match.pendingColor = [null, null]
  match.colorReady = [false, false]
  match.phase = 'play' // the caller either ends the match or advances into sudden death
  return true
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
  const lines = []
  for (const i of [0, 1]) {
    const res = discardAndDeal(match.hand[i], match.undealt[i], match.pendingDiscard?.[i] || [])
    match.hand[i] = res.hand
    match.undealt[i] = res.undealt
    match.discarded[i] = [...match.discarded[i], ...res.discarded]
    lines.push(res.discarded.length
      ? `${nameOfSide(match, i)} discarded ${plural(res.discarded.length, 'card')} and drew ${plural(res.drawn.length, 'card')}.`
      : `${nameOfSide(match, i)} kept their hand (drew ${plural(res.drawn.length, 'card')}).`)
  }
  logEvent(match, { kind: 'discard', title: 'Discards resolved', sections: [{ label: null, lines }] })
  match.pendingDiscard = null
  match.phase = 'play'
  match.discardReady = [false, false]
  startPhaseClock(match)
  return true
}

/** Cards a player can still play: everything in hand plus everything not yet dealt. */
function playableCards(match, idx) {
  return [...match.hand[idx], ...match.undealt[idx]]
}

/** Builds the { revealed, goalCard } shape resolveFinalBoard expects for one side of the match. */
export function finalBoardInputFor(match, idx, entries = match.revealed[idx]) {
  return {
    revealed: entries.map(r => ({
      // The PRINTED color: `color` is overwritten with the resolved one after each speculative
      // pass, and the next pass must start from the card as printed, not from its last result.
      ctoonId: r.ctoonId, name: r.name, characters: r.characters, color: r.baseColor ?? r.color, value: r.baseValue,
      type1: r.type1, type2: r.type2, type3: r.type3, group: r.group,
      isSlam: r.isSlam, effect: r.effect, round: r.round, slot: r.slot
    })),
    goalCard: goalCardFor(match, idx)
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
      effectsResolved: [],
      analysis: { knockedOut: [], negated: [], lostEffects: [], changes: [] }
    }
  }
  for (const idx of [0, 1]) {
    const key = idx === 0 ? 'player1' : 'player2'
    final[key].revealed.forEach((r, i) => {
      if (!match.revealed[idx][i]) return
      match.revealed[idx][i].finalValue = r.finalValue
      match.revealed[idx][i].color = r.color
      match.revealed[idx][i].cancelled = !!r.cancelled
    })
  }
  // A still-Silver card counts as its owner's pick; a side that picked nothing (Silver only arrived
  // in sudden death) gets its best colour for the board as it stands.
  const silvers = [0, 1].map(i => {
    const key = i === 0 ? 'player1' : 'player2'
    if (!final[key].revealed.some(r => r.color === 'SILVER')) return null
    return match.silverColor?.[i] ?? autoSilverColor(match, i)
  })
  // Show the picked colour on the cards themselves (a fallback colour is only used for scoring).
  for (const idx of [0, 1]) {
    if (!match.silverColor?.[idx]) continue
    const key = idx === 0 ? 'player1' : 'player2'
    const recolored = recolorSilver(final[key].revealed, silvers[idx])
    recolored.forEach((r, i) => { if (match.revealed[idx][i]) match.revealed[idx][i].color = r.color })
  }
  const outcome = determineWinner({
    player1GoalColor: match.goalColor[0],
    player2GoalColor: match.goalColor[1],
    player1Revealed: final.player1.revealed,
    player2Revealed: final.player2.revealed,
    player1SilverColor: silvers[0],
    player2SilverColor: silvers[1]
  })
  return { outcome, final }
}

function toRevealEntry(card, round, slot, deckIdx) {
  // finalValue === baseValue at reveal time: effects have not been applied yet.
  return {
    deckIdx,
    ctoonId: card.ctoonId, name: card.name, assetPath: card.assetPath, characters: card.characters,
    color: card.color, baseColor: card.color, baseValue: card.value, finalValue: card.value, cancelled: false,
    cardStyle: card.cardStyle,
    type1: card.type1, type2: card.type2, type3: card.type3, group: card.group,
    isSlam: card.isSlam, effect: card.effect, round, slot
  }
}

/* ── One-card-at-a-time reveal ──────────────────────────────────────────────────────────────
 * A round is still resolved in one server step, but the board is also resolved after EACH card lands —
 * player 1's slot-n card, then player 2's slot-n card, then player 1's slot-(n+1) card, ... — with the
 * very same full-board pass used for final scoring, run over only the cards revealed so far. The
 * clients play those snapshots back so players watch totals, values, colors and knock-outs update card
 * by card. The last snapshot always equals the real board, and final scoring is still decided by
 * `runFinalBoardResolution`, so this is presentation of the same rules, never a different outcome. */

/** The resolved board with every entry in `hidden` left off. */
function snapshotBoard(match, hidden) {
  const kept = [0, 1].map(i => match.revealed[i].filter(r => !hidden.has(r)))
  let final = null
  try {
    final = resolveFinalBoard({
      player1: finalBoardInputFor(match, 0, kept[0]),
      player2: finalBoardInputFor(match, 1, kept[1])
    })
  } catch (err) {
    console.error(`[ogGtoons] reveal-step resolution failed for match ${match.id}:`, err)
  }
  const cards = []
  const totals = [0, 0]
  for (const i of [0, 1]) {
    const resolved = final ? final[i === 0 ? 'player1' : 'player2'].revealed : null
    kept[i].forEach((e, k) => {
      const r = resolved ? resolved[k] : null
      const finalValue = r ? r.finalValue : e.baseValue
      cards.push({ side: i, slot: e.slot, finalValue, color: r ? r.color : (e.baseColor ?? e.color), cancelled: !!(r && r.cancelled) })
      totals[i] += finalValue || 0
    })
  }
  let markers = []
  if (final) {
    try { markers = describeBoard(match, final).markers } catch { markers = [] }
  }
  return { cards, totals, markers }
}

/** Did landing `entry` (on `side`) change anything beyond the card simply appearing at its printed state? */
function boardChanged(prev, next, side, entry) {
  const key = (c) => `${c.side}:${c.slot}`
  const was = new Map(prev.cards.map(c => [key(c), c]))
  const landedKey = `${side}:${entry.slot}`
  for (const c of next.cards) {
    if (key(c) === landedKey) {
      // The new card itself: it counts if powers already moved it off its printed value/color or knocked it out.
      if (c.cancelled || c.finalValue !== entry.baseValue || c.color !== (entry.baseColor ?? entry.color)) return true
      continue
    }
    const old = was.get(key(c))
    if (old && (old.finalValue !== c.finalValue || old.color !== c.color || old.cancelled !== c.cancelled)) return true
  }
  return next.markers.length !== prev.markers.length
}

/**
 * Builds the ordered reveal steps for a batch of just-placed entries (`entries` = [side0, side1]),
 * and leaves the live board showing the final snapshot. Returns { steps, before }: `before` is the
 * board as it stood with the whole batch still face down.
 */
export function buildRevealSteps(match, entries) {
  const seq = [
    ...entries[0].map(e => ({ side: 0, e })),
    ...entries[1].map(e => ({ side: 1, e }))
  ].sort((a, b) => a.e.slot - b.e.slot || a.side - b.side)
  const hidden = new Set(seq.map(x => x.e))
  const before = snapshotBoard(match, hidden)
  let prev = before
  const steps = []
  for (const { side, e } of seq) {
    hidden.delete(e)
    const snap = snapshotBoard(match, hidden)
    steps.push({
      side, slot: e.slot, round: e.round, ctoonId: e.ctoonId, name: e.name,
      baseValue: e.baseValue, baseColor: e.baseColor ?? e.color,
      ...snap, changed: boardChanged(prev, snap, side, e)
    })
    prev = snap
  }
  // Remember the latest resolved board for the public view. Deliberately NOT written onto the revealed
  // entries: their finalValue/color belong to the final scoring pass alone (previews never mutate them).
  match.liveBoard = prev
  return { steps, before }
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
      const entry = toRevealEntry(card, match.currentRound, p.slot, p.cardIdx)
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
  const show = (e) => (e ? `${e.name} (${e.baseValue}, ${COLOR_WORD(e.color)})` : '—')
  logEvent(match, {
    kind: 'reveal', title: `${isSuddenDeathRound(match.currentRound) ? 'Sudden death' : `Round ${match.currentRound}`} revealed`,
    sections: [{ label: null, lines: order.map(slot =>
      `Slot ${slot}: ${nameOfSide(match, 0)} ${show(entries[0].find(e => e.slot === slot))}  vs  ${nameOfSide(match, 1)} ${show(entries[1].find(e => e.slot === slot))}`) }]
  })
  if (match.currentRound < TOTAL_ROUNDS) logPreview(match)
  return { entries, order, ...buildRevealSteps(match, entries) }
}

/**
 * Logs what the powers on the board so far would do, without touching the match. Early rounds
 * only — the real scoring happens once, at the end, and can differ as more cards arrive.
 */
function logPreview(match) {
  try {
    const final = resolveFinalBoard({
      player1: finalBoardInputFor(match, 0), player2: finalBoardInputFor(match, 1)
    })
    const d = describeBoard(match, final)
    if (!d.sections.some(sec => sec.lines.length)) {
      // Nothing is cancelled or changed any more: tell the board to drop markers from an earlier preview.
      if (match.gameLog.some(e => e.kind === 'preview' && e.data?.markers?.length)) {
        logEvent(match, { kind: 'preview', title: 'Powers on the board so far', sections: [{ label: null, lines: ['Nothing is cancelled or changed by powers right now.'] }], data: { markers: [] } })
      }
      return
    }
    logEvent(match, { kind: 'preview', title: 'Powers on the board so far (preview — can change as more cards are played)', sections: d.sections, data: { markers: d.markers } })
  } catch (err) {
    console.error(`[ogGtoons] power preview failed for match ${match.id}:`, err)
  }
}

/**
 * Moves the match on after a step that did NOT end it: bumps the round, then opens the discard
 * phase (after round 1), the slot-7 swap phase (after round 2) or, in sudden death, deals out the
 * undealt cards so a player can choose from everything they have left. A player who cannot swap
 * (no undealt card) is marked done up front; if that is both players, the caller's next
 * `resolveSwapPhase` settles the phase at once.
 */
export function advanceRound(match) {
  const justPlayed = match.currentRound
  match.currentRound += 1
  if (justPlayed === DISCARD_AFTER_ROUND) {
    match.phase = 'discard'
    match.discardReady = [false, false]
    match.pendingDiscard = null
  } else if (justPlayed === SWAP_AFTER_ROUND) {
    match.phase = 'swap'
    match.pendingSwap = [false, false]
    match.swapReady = [!canOfferSwap(match, 0), !canOfferSwap(match, 1)]
  } else {
    match.phase = 'play'
    if (isSuddenDeathRound(match.currentRound)) {
      for (const i of [0, 1]) {
        match.hand[i] = [...match.hand[i], ...match.undealt[i]]
        match.undealt[i] = []
      }
    }
  }
  startPhaseClock(match)
}

/**
 * The clients play a reveal back one card at a time. Call this right after advanceRound() so the next
 * phase's clock starts once that animation is over instead of losing seconds to it.
 */
export function extendDeadlineForReveal(match, steps, timing) {
  if (match.deadline) match.deadline += revealDurationMs(steps, timing)
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
  try {
    logFinalScoring(match, outcome, final, outcome.winner === null && bothHaveCards)
  } catch (err) {
    console.error(`[ogGtoons] scoring log failed for match ${match.id}:`, err)
  }
  if (outcome.winner === null && bothHaveCards) return null
  return {
    outcome: outcome.winner === null ? 'TIE' : (outcome.winner === 'player1' ? 'PLAYER1' : 'PLAYER2'),
    winnerIdx: outcome.winner ? (outcome.winner === 'player1' ? 0 : 1) : null,
    player1Score: outcome.player1Score,
    player2Score: outcome.player2Score,
    effectsResolved: final.effectsResolved
  }
}

function logFinalScoring(match, outcome, final, continues) {
  const d = describeBoard(match, final)
  const [n0, n1] = [nameOfSide(match, 0), nameOfSide(match, 1)]
  const totals = [`${n0}: ${outcome.player1Score}   ${n1}: ${outcome.player2Score}`]
  if (outcome.bonus) totals.push(`${nameOfSide(match, outcome.bonus.player === 'player1' ? 0 : 1)} gets +15 for holding more ${COLOR_WORD(outcome.bonus.color)} cards.`)
  const verdict = outcome.winner === null
    ? (continues ? 'Tied — sudden death.' : 'Tied — no cards left to break it.')
    : `${outcome.winner === 'player1' ? n0 : n1} wins ${outcome.reason === 'both_colors' ? 'by holding the most cards of both goal colors combined' : 'on total value'}.`
  if (!d.notable && !d.sections[4].lines.length) d.sections[0].lines.push('No powers fired — every card scores its printed value.')
  logEvent(match, {
    kind: 'scoring', title: isSuddenDeathRound(match.currentRound) ? 'Sudden-death scoring' : 'Final scoring',
    sections: [...d.sections, { label: 'Result', lines: [...totals, verdict] }], data: { markers: d.markers }
  })
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
  return { rounds, effectsResolved: effectsResolved || [], gameLog: match.gameLog || [] }
}
