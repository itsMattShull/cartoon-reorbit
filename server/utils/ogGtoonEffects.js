// server/utils/ogGtoonEffects.js
//
// Pure interpreter for the original gToons (2002) "Slam gToon" effect schema stored on
// Ctoon.gtoonEffect (a JSON array of OgGtoonEffect objects — see gtoons-plan.md for the full
// type). No socket/db imports: everything here operates on plain data so it can be unit tested
// and reused from server/utils/ogGtoonsSocket.js without pulling in Prisma or Socket.IO.
//
// Resolution order per round (documented in gtoons-plan.md, mirrored exactly here):
//   1. Collect every active effect instance: both players' `onReveal` effects on the card they
//      just revealed this round, plus `static` effects from either player's goal card (position
//      11 of their deck), which are active for the whole match once assigned, not just when
//      revealed.
//   2. Negations first — `negateEffect` actions suppress their target card's OWN effects for
//      this resolution pass (a negated card's onReveal/static effects do not fire this round).
//   3. Color changes next — `setColor` actions, player1's effects before player2's.
//   4. Value modifications last, sub-ordered set -> multiply -> add, player1 before player2
//      within each operation type, so stacking is deterministic.
//   5. Every resolved effect is recorded for the round log / match log UI.
//
// v1 simplification (documented, not silently dropped): `allOwnRevealed` / `allOpponentRevealed`
// target selectors apply only to the CURRENTLY ACTIVE card for that side this round, not to
// already-recorded history. Retroactively re-scoring a past round's finalValue would require
// roundLog to be mutable after the fact, which conflicts with the "roundLog written once, at
// match end" performance requirement. None of the seed data's Slam gToons rely on the wider
// behavior; a future card wanting a true "buff all my revealed cards" effect needs its own
// scoring pass, not this one.

const NEUTRAL_COLORS = new Set(['BLACK', 'SILVER'])

export function isNeutralColor(color) {
  return NEUTRAL_COLORS.has(color)
}

/** Normalizes Ctoon.gtoonEffect (which may be null, a single object, or an array) to an array. */
export function normalizeEffects(raw) {
  if (!raw) return []
  const arr = Array.isArray(raw) ? raw : [raw]
  return arr.filter(isValidEffect)
}

/**
 * Structural validation only — used both here and by the deck/seed layer to reject malformed
 * admin-authored effect JSON before it ever reaches a live match. Does not throw: callers decide
 * whether an invalid effect is fatal (deck save) or just dropped (round resolution, defensively).
 */
export function isValidEffect(e) {
  if (!e || typeof e !== 'object') return false
  if (e.trigger !== 'onReveal' && e.trigger !== 'static') return false
  if (!e.target || typeof e.target !== 'object') return false
  const sel = e.target.selector
  const validSelectors = [
    'self', 'ownActiveCard', 'opponentActiveCard',
    'allOwnRevealed', 'allOpponentRevealed', 'cardByCharacter'
  ]
  if (!validSelectors.includes(sel)) return false
  if (sel === 'cardByCharacter' && typeof e.target.character !== 'string') return false
  if (e.condition) {
    if (e.condition.type !== 'characterInPlay') return false
    if (typeof e.condition.character !== 'string') return false
    if (e.condition.side && !['own', 'opponent', 'either'].includes(e.condition.side)) return false
  }
  const a = e.action
  if (!a || typeof a !== 'object') return false
  if (a.type === 'modifyValue') {
    if (!['add', 'multiply', 'set'].includes(a.operation)) return false
    if (typeof a.amount !== 'number' || !Number.isFinite(a.amount)) return false
  } else if (a.type === 'setColor') {
    if (typeof a.color !== 'string') return false
  } else if (a.type === 'negateEffect') {
    // no extra fields required
  } else {
    return false
  }
  return true
}

/** Validates a full Ctoon.gtoonEffect value (array or single object). Returns { ok, errors }. */
export function validateEffectSchema(raw) {
  if (raw == null) return { ok: true, errors: [] }
  const arr = Array.isArray(raw) ? raw : [raw]
  const errors = []
  arr.forEach((e, i) => { if (!isValidEffect(e)) errors.push(`effect[${i}] is malformed`) })
  return { ok: errors.length === 0, errors }
}

function makeActiveCard(cardData, side) {
  const value = cardData.value != null ? cardData.value : (cardData.gtoonValue != null ? cardData.gtoonValue : 0)
  return {
    ctoonId: cardData.ctoonId || cardData.id,
    name: cardData.name,
    characters: Array.isArray(cardData.characters) ? cardData.characters : [],
    color: cardData.color || cardData.gtoonColor,
    baseValue: value,
    value,
    isSlam: !!(cardData.isSlam ?? cardData.isSlamGtoon),
    effects: normalizeEffects(cardData.effect ?? cardData.gtoonEffect),
    side
  }
}

function conditionMet(inst, revealedCharactersBySide) {
  const cond = inst.effect.condition
  if (!cond) return true
  const side = cond.side || 'either'
  const opponentSide = inst.ownerSide === 'player1' ? 'player2' : 'player1'
  let pool
  if (side === 'own') pool = revealedCharactersBySide[inst.ownerSide]
  else if (side === 'opponent') pool = revealedCharactersBySide[opponentSide]
  else pool = [...revealedCharactersBySide.player1, ...revealedCharactersBySide.player2]
  return pool.includes(cond.character)
}

function resolveTargets(inst, sides) {
  const sel = inst.effect.target.selector
  const ownerSide = inst.ownerSide
  const opponentSide = ownerSide === 'player1' ? 'player2' : 'player1'
  const wrap = (side) => ({ side, card: sides[side], key: `${side}:${sides[side].ctoonId}` })
  switch (sel) {
    case 'self':
    case 'ownActiveCard':
    case 'allOwnRevealed': // v1 simplification — see header comment
      return [wrap(ownerSide)]
    case 'opponentActiveCard':
    case 'allOpponentRevealed': // v1 simplification — see header comment
      return [wrap(opponentSide)]
    case 'cardByCharacter': {
      const targets = []
      for (const s of ['player1', 'player2']) {
        if ((sides[s].characters || []).includes(inst.effect.target.character)) targets.push(wrap(s))
      }
      return targets
    }
    default:
      return []
  }
}

/**
 * Resolves one round's effects.
 *
 * @param {object} params
 * @param {object} params.player1 - { card, goalCard, priorRevealed }
 * @param {object} params.player2 - { card, goalCard, priorRevealed }
 *   card/goalCard shape: { ctoonId, name, characters, color, value, isSlam, effect }
 *   priorRevealed: array of previously revealed { characters } for this side (for
 *   characterInPlay conditions) — the currently revealed card's own characters are added
 *   automatically.
 * @returns {{ player1: {ctoonId,baseValue,finalValue,color}, player2: {...}, effectsResolved: object[] }}
 */
export function resolveRoundEffects({ player1, player2 }) {
  const sides = {
    player1: makeActiveCard(player1.card, 'player1'),
    player2: makeActiveCard(player2.card, 'player2')
  }
  const goalAuras = []
  if (player1.goalCard) goalAuras.push({ card: makeActiveCard(player1.goalCard, 'player1'), side: 'player1' })
  if (player2.goalCard) goalAuras.push({ card: makeActiveCard(player2.goalCard, 'player2'), side: 'player2' })

  const revealedCharactersBySide = {
    player1: [
      ...((player1.priorRevealed || []).flatMap(c => c.characters || [])),
      ...(sides.player1.characters || [])
    ],
    player2: [
      ...((player2.priorRevealed || []).flatMap(c => c.characters || [])),
      ...(sides.player2.characters || [])
    ]
  }

  const instances = []
  for (const side of ['player1', 'player2']) {
    for (const eff of sides[side].effects) {
      if (eff.trigger === 'onReveal') instances.push({ ownerSide: side, sourceCard: sides[side], effect: eff })
    }
  }
  for (const aura of goalAuras) {
    for (const eff of aura.card.effects) {
      if (eff.trigger === 'static') instances.push({ ownerSide: aura.side, sourceCard: aura.card, effect: eff })
    }
  }

  const effectsResolved = []
  const suppressed = new Set()
  const isSuppressed = (side, ctoonId) => suppressed.has(`${side}:${ctoonId}`)

  // 1) Negations
  for (const inst of instances) {
    if (inst.effect.action.type !== 'negateEffect') continue
    if (isSuppressed(inst.ownerSide, inst.sourceCard.ctoonId)) continue
    if (!conditionMet(inst, revealedCharactersBySide)) continue
    for (const t of resolveTargets(inst, sides)) {
      suppressed.add(t.key)
      effectsResolved.push({
        source: inst.ownerSide, sourceCtoonId: inst.sourceCard.ctoonId,
        action: 'negateEffect', targetPlayer: t.side, targetCtoonId: t.card.ctoonId
      })
    }
  }

  // 2) Color changes — player1 before player2
  for (const side of ['player1', 'player2']) {
    for (const inst of instances) {
      if (inst.ownerSide !== side) continue
      if (inst.effect.action.type !== 'setColor') continue
      if (isSuppressed(inst.ownerSide, inst.sourceCard.ctoonId)) continue
      if (!conditionMet(inst, revealedCharactersBySide)) continue
      for (const t of resolveTargets(inst, sides)) {
        t.card.color = inst.effect.action.color
        effectsResolved.push({
          source: inst.ownerSide, sourceCtoonId: inst.sourceCard.ctoonId,
          action: 'setColor', color: inst.effect.action.color,
          targetPlayer: t.side, targetCtoonId: t.card.ctoonId
        })
      }
    }
  }

  // 3) Value mods — set, then multiply, then add; player1 before player2 within each
  for (const op of ['set', 'multiply', 'add']) {
    for (const side of ['player1', 'player2']) {
      for (const inst of instances) {
        if (inst.ownerSide !== side) continue
        if (inst.effect.action.type !== 'modifyValue') continue
        if (inst.effect.action.operation !== op) continue
        if (isSuppressed(inst.ownerSide, inst.sourceCard.ctoonId)) continue
        if (!conditionMet(inst, revealedCharactersBySide)) continue
        for (const t of resolveTargets(inst, sides)) {
          const before = t.card.value
          if (op === 'set') t.card.value = inst.effect.action.amount
          else if (op === 'multiply') t.card.value = t.card.value * inst.effect.action.amount
          else t.card.value = t.card.value + inst.effect.action.amount
          effectsResolved.push({
            source: inst.ownerSide, sourceCtoonId: inst.sourceCard.ctoonId,
            action: 'modifyValue', operation: op, amount: inst.effect.action.amount,
            targetPlayer: t.side, targetCtoonId: t.card.ctoonId,
            valueBefore: before, valueAfter: t.card.value
          })
        }
      }
    }
  }

  return {
    player1: {
      ctoonId: sides.player1.ctoonId, baseValue: sides.player1.baseValue,
      finalValue: sides.player1.value, color: sides.player1.color
    },
    player2: {
      ctoonId: sides.player2.ctoonId, baseValue: sides.player2.baseValue,
      finalValue: sides.player2.value, color: sides.player2.color
    },
    effectsResolved
  }
}
