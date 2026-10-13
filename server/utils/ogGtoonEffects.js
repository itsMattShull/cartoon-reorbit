// server/utils/ogGtoonEffects.js
//
// Pure interpreter for the original gToons (2002) "Slam gToon" effect schema stored on
// Ctoon.gtoonEffect (a JSON array of OgGtoonEffect objects). No socket/db imports: everything
// here operates on plain data so it can be unit tested and reused from
// server/utils/ogGtoonsSocket.js without pulling in Prisma or Socket.IO.
//
// ── Two resolution functions live here ─────────────────────────────────────────────────────
//
// `resolveRoundEffects` is the ORIGINAL per-round resolver (unchanged — see its own header
// below). It is kept purely for backward compatibility / unit-test coverage of the original v1
// schema; `server/utils/ogGtoonsSocket.js` no longer calls it in production. Each round it now
// only shows the two newly-revealed cards' BASE values (no effects applied) for the live board
// animation, matching the real 2002 game's UX: cards flip and show base values, then a single
// "Scoring..." pass computes final totals once every round is revealed.
//
// `resolveFinalBoard` is the NEW full-board resolver and is what actually decides the match. It
// runs exactly once, when round 7 (or the deciding sudden-death round) completes, over the
// COMPLETE ordered revealed-card arrays for both sides plus both players' goal cards (whose
// `static` effects are always active). Having the whole board available is what makes the new
// mechanics (allMatching, neighborOwn, perMatch board-wide counts) possible: none of them can be
// evaluated correctly with only "the two cards revealed this round," which is all the old
// per-round call had access to.
//
// ── Effect schema (superset of the original) ───────────────────────────────────────────────
// {
//   trigger: 'onReveal' | 'static',
//   target: {
//     selector: 'self' | 'ownActiveCard' | 'opponentActiveCard' | 'allOwnRevealed' |
//               'allOpponentRevealed' | 'cardByCharacter' | 'neighborOwn' | 'allMatching',
//     character?: string,                 // cardByCharacter
//     positions?: ['prev','next'],         // neighborOwn — which neighbor slot(s); default both
//     filter?: { by, value } | { filters: [{by,value}, ...] },   // neighborOwn (optional)
//     scope?: 'own' | 'opponent' | 'both', // allMatching
//     filters?: [{ by: 'type'|'color'|'group'|'value', value }, ...], // allMatching (AND'ed)
//     excludeSelf?: boolean                // allMatching — omit the source card itself
//   },
//   condition?: {
//     type: 'characterInPlay' | 'typeInPlay' | 'groupInPlay' | 'colorInPlay' | 'valueInPlay' |
//           'targetLacksType',
//     side?: 'own' | 'opponent' | 'either', // board-scan conditions only (not targetLacksType)
//     character?, cardType?, group?, color?, value?   // one of these per condition.type
//   },
//   action: {
//     type: 'modifyValue' | 'setColor' | 'negateEffect',
//     operation?: 'add' | 'multiply' | 'set',
//     amount?: number,
//     perMatch?: {                          // "+N for each X in play" aggregation
//       by?: 'type'|'color'|'group'|'character', value?,   // shorthand single clause
//       filters?: [{ by, value }, ...],      // or an explicit AND'ed list (e.g. "Female Animal")
//       scope: 'own' | 'opponent' | 'both' | 'neighborOwn'
//     },
//     color?: string
//   }
// }
//
// Later additions to the schema (all optional):
//   - characters: `target.character`, `condition.character` and a `character` filter value may be
//     a list of names (any match). `condition.mode: 'all'` requires EVERY listed name in play.
//     Names compare ignoring case and a leading "the".
//   - filter clause { by: 'anyOf', value: [clause, ...] } — an OR inside an allMatching filter list.
//   - condition flags: `excludeSelf` (the source card does not count, "any OTHER Hero"),
//     `oppositeOnly` (only the card facing the source in the same slot, "opposite card is Blue"),
//     `adjacentOnly` (neighbors only). Condition types `targetHasType` (inverse of
//     targetLacksType) and `slotIs` { slot } ("played as the last card" = slot 7).
//   - perMatch.excludeSelf — "+2 for each OTHER Bean Scout".
//   - action `negateAdjacency` — like negateEffect but only switches off the target's
//     neighbor-dependent effects (adjacentOnly conditions, neighborOwn targets, neighborOwn counts).
//
// Design notes on the new pieces (read this before touching ogGtoonPowerCatalog.js):
//   - "opponentActiveCard" / "ownActiveCard", in the final-board pass, mean "the card revealed by
//     that side in the SAME ROUND POSITION as the source card" (i.e. same index in that side's
//     revealed array) — the natural carry-over of what "the active card" meant when resolution
//     was per-round. This is how "-5 to opposing card if not a Villain" and "x4 if opposite card
//     is Blue" are expressed (targetLacksType/colorInPlay + opponentActiveCard).
//   - "allOwnRevealed" / "allOpponentRevealed" are UPGRADED here: they now genuinely mean every
//     card that side has revealed all match, not just the current round's card. That removed the
//     old v1 simplification note — it only existed because the per-round resolver could not see
//     history; the final-board resolver can.
//   - "next to X" ("+10 if next to Bubbles") is modeled as a CONDITION scanning the source card's
//     own immediate neighbor positions (prev/next round index, own side), via
//     condition.type: 'characterInPlay' with an added `adjacentOnly: true` flag — see
//     `conditionMet` below. "each neighboring X" ("+5 to each neighboring Animal") is instead a
//     TARGET (`neighborOwn`) because it applies the effect to each matching neighbor card
//     individually, not to the source card once. "+N for each neighboring X" ("+2 for each
//     neighboring Red card") aggregates onto the source card, so it is `perMatch` with
//     `scope: 'neighborOwn'`. Kept consistent: "next to"/"neighboring" always looks at the
//     source card's own side, at round-index -1 and/or +1 (both, unless `positions` narrows it).
//   - `allMatching` filter clauses of `by: 'value'` compare against a card's printed
//     (`baseValue`), never its running/mutated value — "all 8s" means "printed as an 8," not
//     "currently worth 8 after other buffs." Every other filter (`type`/`color`/`group`) is
//     evaluated against the card's CURRENT state at the point in the phase order it is checked,
//     the same way the original per-round resolver let phase 2 (`setColor`) changes feed phase 3
//     (`modifyValue`) selectors — this file mutates `card.color`/`card.value` in place as each
//     phase runs, exactly like the original code did.
//   - `perMatch`: the flat `action.amount` is applied ONCE PER MATCHING CARD found for
//     `operation: 'add'` (effective amount = amount * matchCount) and for `operation: 'multiply'`
//     (documented simplification: also amount * matchCount, i.e. treated as repeated additions to
//     the multiplier rather than true exponentiation — no catalog power needs true compounding).
//     `operation: 'set'` ignores the count except that a zero-match perMatch effect never fires
//     (nothing to "set once per").
//   - `excludeSelf` on `allMatching` covers "to all OTHER Heroes"/"to all other Blue cards"
//     wording — it removes the source card from that effect's own match set. Anywhere the source
//     text says "all X" with no "other," `excludeSelf` is left false/omitted (self may or may not
//     match the filter; if it does, it's included like the rest of the board).
//
// ── Resolution order (final board pass) — read this before changing phase ordering ─────────
//   1. Collect every active effect instance: both sides' `onReveal` effects on EVERY card they
//      revealed the whole match, plus `static` effects from either player's goal card (always
//      active once a match starts).
//   2. Negations first — `negateEffect` suppresses the TARGET card's own effect instances for the
//      rest of this pass (a negated card's onReveal/static effects never fire in this call).
//   3. Color changes next — `setColor`, player1's effects before player2's.
//   4. Value modifications last, sub-ordered set -> multiply -> add; within each operation
//      bucket, player1's effects resolve before player2's. `perMatch`/`allMatching` effects slot
//      into whichever operation-type bucket their `action.operation` specifies, exactly like any
//      other `modifyValue` effect — they are not a separate phase.
//   5. Every individual application (source, target, action) is recorded in `effectsResolved` for
//      the match-log UI, in the order it was actually applied.
//
// Resolution order (`resolveRoundEffects`, unchanged from v1): negations -> color changes
// (player1 before player2) -> value mods (set -> multiply -> add, player1 before player2 within
// each) -> every resolved effect recorded.

const CARD_TYPES = new Set(['ANIMAL', 'FEMALE', 'HERO', 'MALE', 'MONSTER', 'PLACE', 'PROP', 'VEHICLE', 'VILLAIN'])
const GROUPS = new Set([
  'BEAN_SCOUTS', 'DAILY_PLANET', 'GLOBAL', 'IMAGINARY_FRIEND', 'INJUSTICE_GANG',
  'JUSTICE_FRIENDS', 'JUSTICE_LEAGUE', 'MUCHA_LUCHA', 'MYSTERY_INC', 'POWERPUFF_GIRLS',
  'SQUIRREL_SCOUTS', 'TEEN_TITANS', 'TIME_SQUAD', 'WOOHP'
])
const COLORS = new Set(['BLACK', 'SILVER', 'BLUE', 'RED', 'YELLOW', 'GREEN', 'PURPLE', 'ORANGE', 'PINK'])

const BASE_SELECTORS = ['self', 'ownActiveCard', 'opponentActiveCard', 'allOwnRevealed', 'allOpponentRevealed', 'cardByCharacter']
const NEW_SELECTORS = ['neighborOwn', 'allMatching']
const ALL_SELECTORS = [...BASE_SELECTORS, ...NEW_SELECTORS]

/** Normalizes Ctoon.gtoonEffect (which may be null, a single object, or an array) to an array. */
export function normalizeEffects(raw) {
  if (!raw) return []
  const arr = Array.isArray(raw) ? raw : [raw]
  return arr.filter(isValidEffect)
}

function isFilterClauseValid(f) {
  if (!f || typeof f !== 'object') return false
  // { by: 'anyOf', value: [clause, ...] } — matches when ANY listed clause matches (an OR inside the AND'ed list).
  if (f.by === 'anyOf') return Array.isArray(f.value) && f.value.length > 0 && f.value.every(isFilterClauseValid)
  if (!['type', 'color', 'group', 'value', 'character'].includes(f.by)) return false
  if (f.by === 'type' && !CARD_TYPES.has(f.value)) return false
  if (f.by === 'color' && !COLORS.has(f.value)) return false
  if (f.by === 'group' && !GROUPS.has(f.value)) return false
  if (f.by === 'value' && typeof f.value !== 'number') return false
  if (f.by === 'character' && !isCharacterRef(f.value)) return false
  return true
}

/** A character reference is one name, or a non-empty list of names (matches any of them). */
function isCharacterRef(v) {
  if (typeof v === 'string') return true
  return Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string')
}

/** Character names compare ignoring case, spacing and a leading "the" ("The Flea" == "Flea"). */
function normName(n) {
  return String(n).trim().toLowerCase().replace(/\s+/g, ' ').replace(/^the /, '')
}

/** Does `card` have the character `ref` (a name, or any of a list of names)? */
function hasCharacter(card, ref) {
  const have = (card.characters || []).map(normName)
  return (Array.isArray(ref) ? ref : [ref]).some(r => have.includes(normName(r)))
}

function areFiltersValid(filters) {
  if (filters == null) return true
  if (!Array.isArray(filters) || filters.length === 0) return false
  return filters.every(isFilterClauseValid)
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
  const t = e.target
  const sel = t.selector
  if (!ALL_SELECTORS.includes(sel)) return false
  if (sel === 'cardByCharacter' && !isCharacterRef(t.character)) return false
  if (sel === 'neighborOwn') {
    if (t.positions != null) {
      if (!Array.isArray(t.positions) || t.positions.length === 0) return false
      if (!t.positions.every(p => p === 'prev' || p === 'next')) return false
    }
    if (t.filter != null) {
      const filters = Array.isArray(t.filter?.filters) ? t.filter.filters : [t.filter]
      if (!areFiltersValid(filters)) return false
    }
  }
  if (sel === 'allMatching') {
    if (t.scope && !['own', 'opponent', 'both'].includes(t.scope)) return false
    if (!areFiltersValid(t.filters)) return false
    if (t.excludeSelf != null && typeof t.excludeSelf !== 'boolean') return false
  }
  if (e.condition) {
    const c = e.condition
    const validTypes = ['characterInPlay', 'typeInPlay', 'groupInPlay', 'colorInPlay', 'valueInPlay', 'targetLacksType', 'targetHasType', 'slotIs']
    if (!validTypes.includes(c.type)) return false
    if (c.side && !['own', 'opponent', 'either'].includes(c.side)) return false
    if (c.type === 'characterInPlay' && !isCharacterRef(c.character)) return false
    if (c.mode != null && c.mode !== 'any' && c.mode !== 'all') return false
    if (c.excludeSelf != null && typeof c.excludeSelf !== 'boolean') return false
    if (c.oppositeOnly != null && typeof c.oppositeOnly !== 'boolean') return false
    if (c.type === 'slotIs' && !(Number.isInteger(c.slot) && c.slot >= 1)) return false
    if (c.type === 'typeInPlay' && !CARD_TYPES.has(c.cardType)) return false
    if (c.type === 'groupInPlay' && !GROUPS.has(c.group)) return false
    if (c.type === 'colorInPlay' && !COLORS.has(c.color)) return false
    if (c.type === 'valueInPlay' && typeof c.value !== 'number') return false
    if ((c.type === 'targetLacksType' || c.type === 'targetHasType') && !CARD_TYPES.has(c.cardType)) return false
    if (c.adjacentOnly != null && typeof c.adjacentOnly !== 'boolean') return false
  }
  const a = e.action
  if (!a || typeof a !== 'object') return false
  if (a.type === 'modifyValue') {
    if (!['add', 'multiply', 'set'].includes(a.operation)) return false
    if (typeof a.amount !== 'number' || !Number.isFinite(a.amount)) return false
    if (a.perMatch != null) {
      const pm = a.perMatch
      if (!pm.scope || !['own', 'opponent', 'both', 'neighborOwn'].includes(pm.scope)) return false
      const filters = Array.isArray(pm.filters) ? pm.filters : (pm.by ? [{ by: pm.by, value: pm.value }] : null)
      if (!areFiltersValid(filters)) return false
      if (pm.excludeSelf != null && typeof pm.excludeSelf !== 'boolean') return false
    }
  } else if (a.type === 'setColor') {
    if (typeof a.color !== 'string') return false
  } else if (a.type === 'negateEffect' || a.type === 'negateAdjacency') {
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

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * ORIGINAL v1 per-round resolver — UNCHANGED. See module header for why this still exists.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

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

function conditionMetV1(inst, revealedCharactersBySide) {
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

function resolveTargetsV1(inst, sides) {
  const sel = inst.effect.target.selector
  const ownerSide = inst.ownerSide
  const opponentSide = ownerSide === 'player1' ? 'player2' : 'player1'
  const wrap = (side) => ({ side, card: sides[side], key: `${side}:${sides[side].ctoonId}` })
  switch (sel) {
    case 'self':
    case 'ownActiveCard':
    case 'allOwnRevealed': // v1 simplification — see module header
      return [wrap(ownerSide)]
    case 'opponentActiveCard':
    case 'allOpponentRevealed': // v1 simplification — see module header
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
 * Resolves one round's effects using the ORIGINAL v1 schema only (characterInPlay condition,
 * self/ownActiveCard/opponentActiveCard/allOwnRevealed/allOpponentRevealed/cardByCharacter
 * targets, modifyValue/setColor/negateEffect actions). Kept for backward compatibility and unit
 * tests; not called by ogGtoonsSocket.js anymore (see module header).
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
    if (!conditionMetV1(inst, revealedCharactersBySide)) continue
    for (const t of resolveTargetsV1(inst, sides)) {
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
      if (!conditionMetV1(inst, revealedCharactersBySide)) continue
      for (const t of resolveTargetsV1(inst, sides)) {
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
        if (!conditionMetV1(inst, revealedCharactersBySide)) continue
        for (const t of resolveTargetsV1(inst, sides)) {
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

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * NEW full-board resolver — resolveFinalBoard. See module header for schema + resolution order.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

function makeBoardCard(cardData, side, roundIndex) {
  const value = cardData.value != null ? cardData.value : (cardData.gtoonValue != null ? cardData.gtoonValue : 0)
  return {
    ctoonId: cardData.ctoonId || cardData.id,
    name: cardData.name,
    characters: Array.isArray(cardData.characters) ? cardData.characters : [],
    color: cardData.color || cardData.gtoonColor,
    type1: cardData.type1 ?? cardData.gtoonType1 ?? null,
    type2: cardData.type2 ?? cardData.gtoonType2 ?? null,
    type3: cardData.type3 ?? cardData.gtoonType3 ?? null,
    group: cardData.group ?? cardData.gtoonGroup ?? null,
    baseValue: value,
    value,
    isSlam: !!(cardData.isSlam ?? cardData.isSlamGtoon),
    effects: normalizeEffects(cardData.effect ?? cardData.gtoonEffect),
    round: cardData.round,
    roundIndex, // 0-based index within THIS side's revealed array (used for neighbor adjacency)
    side
  }
}

const isNegation = (effect) => effect.action.type === 'negateEffect' || effect.action.type === 'negateAdjacency'

/**
 * "Adjacency effects" are the ones that depend on a card's neighbors: a `next to X` condition, a
 * neighboring-card target, or a neighboring-card count. `negateAdjacency` switches off only these.
 */
function isAdjacencyEffect(effect) {
  return !!(effect.condition?.adjacentOnly ||
    effect.target?.selector === 'neighborOwn' ||
    effect.action?.perMatch?.scope === 'neighborOwn')
}

function cardTypes(card) {
  return [card.type1, card.type2, card.type3].filter(Boolean)
}

function normalizeFilterClauses(filterLike) {
  if (!filterLike) return null
  if (Array.isArray(filterLike)) return filterLike
  if (Array.isArray(filterLike.filters)) return filterLike.filters
  if (filterLike.by) return [{ by: filterLike.by, value: filterLike.value }]
  return null
}

function cardMatchesClause(card, clause) {
  switch (clause.by) {
    case 'anyOf': return clause.value.some(c => cardMatchesClause(card, c))
    case 'type': return cardTypes(card).includes(clause.value)
    case 'color': return card.color === clause.value
    case 'group': return card.group === clause.value
    case 'value': return card.baseValue === clause.value // always printed value, see header
    case 'character': return hasCharacter(card, clause.value)
    default: return false
  }
}

function cardMatchesFilters(card, filters) {
  if (!filters || filters.length === 0) return true
  return filters.every(c => cardMatchesClause(card, c))
}

/** All cards revealed by `side`, flattened. */
function revealedOf(sides, side) {
  return sides[side]
}

function neighborsOf(sides, side, roundIndex, positions) {
  const pos = positions && positions.length ? positions : ['prev', 'next']
  const list = revealedOf(sides, side)
  const out = []
  if (pos.includes('prev')) {
    const c = list.find(c => c.roundIndex === roundIndex - 1)
    if (c) out.push(c)
  }
  if (pos.includes('next')) {
    const c = list.find(c => c.roundIndex === roundIndex + 1)
    if (c) out.push(c)
  }
  return out
}

function sameRoundOpponentCard(sides, ownerSide, roundIndex) {
  const opponentSide = ownerSide === 'player1' ? 'player2' : 'player1'
  return revealedOf(sides, opponentSide).find(c => c.roundIndex === roundIndex) || null
}

function isSameCard(a, b) {
  return a.side === b.side && a.roundIndex === b.roundIndex
}

/** Does `pool` satisfy the board-scan condition `cond`? (characterInPlay can list several names, any/all.) */
function poolSatisfies(pool, cond) {
  switch (cond.type) {
    case 'characterInPlay': {
      if (!Array.isArray(cond.character)) return pool.some(c => hasCharacter(c, cond.character))
      return cond.mode === 'all'
        ? cond.character.every(n => pool.some(c => hasCharacter(c, n)))
        : pool.some(c => hasCharacter(c, cond.character))
    }
    case 'typeInPlay': return pool.some(c => cardTypes(c).includes(cond.cardType))
    case 'groupInPlay': return pool.some(c => c.group === cond.group)
    case 'colorInPlay': return pool.some(c => c.color === cond.color)
    case 'valueInPlay': return pool.some(c => c.baseValue === cond.value)
    default: return true
  }
}

function conditionMet(inst, sides, targetCard) {
  const cond = inst.effect.condition
  if (!cond) return true

  if (cond.type === 'targetLacksType') {
    if (!targetCard) return false
    return !cardTypes(targetCard).includes(cond.cardType)
  }
  if (cond.type === 'targetHasType') {
    if (!targetCard) return false
    return cardTypes(targetCard).includes(cond.cardType)
  }
  // "played as the last card" — the source card sits in board slot N (roundIndex is slot - 1).
  if (cond.type === 'slotIs') return inst.sourceCard.roundIndex === cond.slot - 1

  // "next to X" — the source card's own adjacent (prev/next round-index) cards on its own side.
  if (cond.adjacentOnly) {
    return poolSatisfies(neighborsOf(sides, inst.ownerSide, inst.sourceCard.roundIndex, cond.positions), cond)
  }
  // "opposite card is X" — only the card facing the source card in the same slot.
  if (cond.oppositeOnly) {
    const opp = sameRoundOpponentCard(sides, inst.ownerSide, inst.sourceCard.roundIndex)
    return poolSatisfies(opp ? [opp] : [], cond)
  }

  const side = cond.side || 'either'
  const opponentSide = inst.ownerSide === 'player1' ? 'player2' : 'player1'
  let pool
  if (side === 'own') pool = revealedOf(sides, inst.ownerSide)
  else if (side === 'opponent') pool = revealedOf(sides, opponentSide)
  else pool = [...revealedOf(sides, 'player1'), ...revealedOf(sides, 'player2')]
  // "any OTHER Hero in play" — the source card does not count toward its own condition.
  if (cond.excludeSelf) pool = pool.filter(c => !isSameCard(c, inst.sourceCard))
  return poolSatisfies(pool, cond)
}

/** Resolves the target CARD list (not yet condition-filtered) for a single effect instance. */
function resolveTargets(inst, sides) {
  const sel = inst.effect.target.selector
  const ownerSide = inst.ownerSide
  const opponentSide = ownerSide === 'player1' ? 'player2' : 'player1'
  const wrap = (card) => ({ side: card.side, card, key: `${card.side}:${card.roundIndex}` })

  switch (sel) {
    case 'self':
      return [wrap(inst.sourceCard)]
    case 'ownActiveCard': {
      const c = revealedOf(sides, ownerSide).find(c => c.roundIndex === inst.sourceCard.roundIndex)
      return c ? [wrap(c)] : []
    }
    case 'opponentActiveCard': {
      const c = sameRoundOpponentCard(sides, ownerSide, inst.sourceCard.roundIndex)
      return c ? [wrap(c)] : []
    }
    case 'allOwnRevealed':
      return revealedOf(sides, ownerSide).map(wrap)
    case 'allOpponentRevealed':
      return revealedOf(sides, opponentSide).map(wrap)
    case 'cardByCharacter': {
      const targets = []
      for (const s of ['player1', 'player2']) {
        for (const c of revealedOf(sides, s)) {
          if (hasCharacter(c, inst.effect.target.character)) targets.push(wrap(c))
        }
      }
      return targets
    }
    case 'neighborOwn': {
      const neighbors = neighborsOf(sides, ownerSide, inst.sourceCard.roundIndex, inst.effect.target.positions)
      const filters = normalizeFilterClauses(inst.effect.target.filter)
      return neighbors.filter(c => cardMatchesFilters(c, filters)).map(wrap)
    }
    case 'allMatching': {
      const scope = inst.effect.target.scope || 'both'
      const pools = []
      if (scope === 'own' || scope === 'both') pools.push(...revealedOf(sides, ownerSide))
      if (scope === 'opponent' || scope === 'both') pools.push(...revealedOf(sides, opponentSide))
      const filters = inst.effect.target.filters || null
      let matched = pools.filter(c => cardMatchesFilters(c, filters))
      if (inst.effect.target.excludeSelf) {
        matched = matched.filter(c => !isSameCard(c, inst.sourceCard))
      }
      return matched.map(wrap)
    }
    default:
      return []
  }
}

/** Counts matching cards for a perMatch aggregation, from the effect owner's point of view. */
function countPerMatch(inst, sides, pm) {
  const ownerSide = inst.ownerSide
  const opponentSide = ownerSide === 'player1' ? 'player2' : 'player1'
  const filters = normalizeFilterClauses(pm)
  let pool
  if (pm.scope === 'own') pool = revealedOf(sides, ownerSide)
  else if (pm.scope === 'opponent') pool = revealedOf(sides, opponentSide)
  else if (pm.scope === 'neighborOwn') pool = neighborsOf(sides, ownerSide, inst.sourceCard.roundIndex, null)
  else pool = [...revealedOf(sides, 'player1'), ...revealedOf(sides, 'player2')]
  if (pm.excludeSelf) pool = pool.filter(c => !isSameCard(c, inst.sourceCard))
  return pool.filter(c => cardMatchesFilters(c, filters)).length
}

/**
 * Board position of a revealed card. Matches place cards into numbered slots (1-based), so
 * neighbor/opposite adjacency follows the slot — an empty slot breaks a chain. Snapshots without a
 * `slot` (older callers/tests) fall back to their index in the revealed array.
 */
function boardIndexOf(card, arrayIndex) {
  return Number.isInteger(card.slot) ? card.slot - 1 : arrayIndex
}

/**
 * Resolves the FINAL board for a completed match (round 3's swap step, or the deciding sudden-death
 * round). This is the single authoritative effects pass — see module header for the effect schema.
 *
 * ── Dependency-aware resolution ─────────────────────────────────────────────────────────────
 * Powers depend on each other: a recolor only exists while the card that cast it does, a
 * negation only works while the negating card is itself live, and "in play" counts must not
 * include cards that were knocked out. So the board is never patched incrementally. Instead:
 *   1. Duplicate cancellation: a gToon (same ctoonId) on BOTH boards is knocked out on both sides —
 *      value 0, no powers, and invisible to every condition, count and neighbor check.
 *   2. Every evaluation starts from the PRINTED color/value of each remaining card and applies
 *      only the effects of cards that are live (not knocked out, not negated): colors first
 *      (player1 before player2), then values (set -> multiply -> add, player1 first).
 *   3. The negated set is found by fixed-point iteration: evaluate, collect who gets negated by
 *      the live negators, re-evaluate from scratch with that set, until it stops changing. A
 *      chain (A negates B, B negates C) therefore settles with B negated and C restored, and
 *      everything B had changed is recomputed as if B never fired.
 *   4. If the negations never settle (two cards negating each other), fall back to resolving the
 *      negators one at a time in a fixed order — player1 before player2, lower slot first — where
 *      a negator that has already been negated no longer fires.
 * `effectsResolved` is built from the final, stable evaluation only, so the log lists exactly the
 * effects that count.
 *
 * @param {object} params
 * @param {object} params.player1 - { revealed: [cardSnapshot, ...], goalCard: cardSnapshot|null }
 * @param {object} params.player2 - same shape
 * @param {boolean} [params.cancelDuplicates=true] - false turns duplicate cancellation off (unused by
 *   live play: PvP and practice both cancel the same gToon on both boards).
 *   cardSnapshot: { ctoonId, name, characters, color, value, type1, type2, type3, group, isSlam,
 *                    effect, round, slot } — `color`/`value` must be the PRINTED ones.
 * @returns {{ player1: { revealed: [{ctoonId,round,baseValue,finalValue,color,cancelled}], totalValue },
 *             player2: {...}, effectsResolved: object[] }}
 */
export function resolveFinalBoard({ player1, player2, cancelDuplicates = true }) {
  const boards = {
    player1: (player1.revealed || []).map((c, i) => ({ data: c, roundIndex: boardIndexOf(c, i) })),
    player2: (player2.revealed || []).map((c, i) => ({ data: c, roundIndex: boardIndexOf(c, i) }))
  }
  const goalSnapshots = { player1: player1.goalCard || null, player2: player2.goalCard || null }

  // 1) Duplicate cancellation — fixed for the whole pass, decided from printed identities.
  const idsOn = (side) => new Set(boards[side].map(b => b.data.ctoonId ?? b.data.id))
  const p1Ids = idsOn('player1')
  const p2Ids = idsOn('player2')
  const isDuplicate = (b) => {
    const id = b.data.ctoonId ?? b.data.id
    return cancelDuplicates && id != null && p1Ids.has(id) && p2Ids.has(id)
  }

  /** A fresh board in printed state, minus knocked-out cards (unless `ignoreDuplicates`). */
  function buildState(ignoreDuplicates = false) {
    const sides = { player1: [], player2: [] }
    for (const side of ['player1', 'player2']) {
      for (const b of boards[side]) {
        if (!ignoreDuplicates && isDuplicate(b)) continue
        const card = makeBoardCard(b.data, side, b.roundIndex)
        card.origin = b
        sides[side].push(card)
      }
    }
    const instances = []
    for (const side of ['player1', 'player2']) {
      for (const card of sides[side]) {
        for (const eff of card.effects) {
          if (eff.trigger === 'onReveal') instances.push({ ownerSide: side, sourceCard: card, effect: eff })
        }
      }
    }
    for (const side of ['player1', 'player2']) {
      const g = goalSnapshots[side]
      if (!g) continue
      const aura = makeBoardCard(g, side, -1)
      for (const eff of aura.effects) {
        if (eff.trigger === 'static') instances.push({ ownerSide: side, sourceCard: aura, effect: eff })
      }
    }
    return { sides, instances }
  }

  const keyOf = (card) => `${card.side}:${card.roundIndex}`
  const logBase = (inst, t) => ({
    source: inst.ownerSide, sourceCtoonId: inst.sourceCard.ctoonId, sourceRound: inst.sourceCard.round,
    targetPlayer: t.side, targetCtoonId: t.card.ctoonId, targetRound: t.card.round,
    sourceIndex: inst.sourceCard.roundIndex, targetIndex: t.card.roundIndex,
    adjacency: isAdjacencyEffect(inst.effect)
  })
  /** Token for a negation hit: the card key, plus '#adj' when only its adjacency effects are switched off. */
  const tokenOf = (inst, t) => (inst.effect.action.type === 'negateAdjacency' ? `${t.key}#adj` : t.key)

  /** Targets a negation instance hits right now (condition-checked), or []. */
  function negationTargets(state, inst) {
    return resolveTargets(inst, state.sides).filter(t => conditionMet(inst, state.sides, t.card))
  }

  /** One full evaluation from printed state with `negated` (set of card keys) fixed. */
  function evaluate(negated, ignoreDuplicates = false) {
    const state = buildState(ignoreDuplicates)
    const live = (inst) => {
      const k = keyOf(inst.sourceCard)
      return !negated.has(k) && !(isAdjacencyEffect(inst.effect) && negated.has(`${k}#adj`))
    }
    const log = { negate: [], color: [], value: [] }

    // Colors — player1 before player2.
    for (const side of ['player1', 'player2']) {
      for (const inst of state.instances) {
        if (inst.ownerSide !== side || inst.effect.action.type !== 'setColor' || !live(inst)) continue
        for (const t of resolveTargets(inst, state.sides)) {
          if (!conditionMet(inst, state.sides, t.card)) continue
          t.card.color = inst.effect.action.color
          log.color.push({ ...logBase(inst, t), action: 'setColor', color: inst.effect.action.color })
        }
      }
    }

    // Who the live negators hit, judged on the board as recolored above.
    const hits = new Map() // card key -> { inst, t }[]
    for (const inst of state.instances) {
      if (!isNegation(inst.effect) || !live(inst)) continue
      for (const t of negationTargets(state, inst)) {
        const token = tokenOf(inst, t)
        if (!hits.has(token)) hits.set(token, [])
        hits.get(token).push({ inst, t })
        log.negate.push({ ...logBase(inst, t), action: inst.effect.action.type })
      }
    }

    // Values — set, then multiply, then add; player1 before player2 within each.
    for (const op of ['set', 'multiply', 'add']) {
      for (const side of ['player1', 'player2']) {
        for (const inst of state.instances) {
          if (inst.ownerSide !== side || inst.effect.action.type !== 'modifyValue') continue
          if (inst.effect.action.operation !== op || !live(inst)) continue
          const pm = inst.effect.action.perMatch
          let matchCount = null
          if (pm) {
            matchCount = countPerMatch(inst, state.sides, pm)
            if (matchCount === 0) continue // nothing to apply "once per"
          }
          for (const t of resolveTargets(inst, state.sides)) {
            if (!conditionMet(inst, state.sides, t.card)) continue
            const before = t.card.value
            const effectiveAmount = pm ? inst.effect.action.amount * matchCount : inst.effect.action.amount
            if (op === 'set') t.card.value = effectiveAmount
            else if (op === 'multiply') t.card.value = t.card.value * effectiveAmount
            else t.card.value = t.card.value + effectiveAmount
            log.value.push({
              ...logBase(inst, t),
              action: 'modifyValue', operation: op, amount: effectiveAmount,
              ...(pm ? { perMatchCount: matchCount, perMatchAmount: inst.effect.action.amount } : {}),
              valueBefore: before, valueAfter: t.card.value
            })
          }
        }
      }
    }
    return { state, hits, log }
  }

  const sameSet = (a, b) => a.size === b.size && [...a].every(k => b.has(k))

  // 2-3) Fixed point over the negated set.
  let negated = new Set()
  let result = null
  const seen = []
  for (let pass = 0; pass < 16; pass++) {
    const r = evaluate(negated)
    const next = new Set(r.hits.keys())
    if (sameSet(next, negated)) { result = r; break }
    seen.push(negated)
    negated = next
    if (seen.some(s => sameSet(s, negated))) break // oscillating — negators negate each other
  }

  // 4) Cycle fallback — negators resolve one at a time in a fixed order.
  if (!result) {
    negated = new Set()
    const order = buildState().instances
      .filter(i => isNegation(i.effect))
      .sort((a, b) => (a.ownerSide === b.ownerSide ? 0 : a.ownerSide === 'player1' ? -1 : 1) ||
        (a.sourceCard.roundIndex - b.sourceCard.roundIndex))
    for (const want of order) {
      if (negated.has(keyOf(want.sourceCard))) continue
      const state = evaluate(negated).state
      const inst = state.instances.find(i => i.ownerSide === want.ownerSide &&
        i.sourceCard.roundIndex === want.sourceCard.roundIndex && i.effect === want.effect)
      if (!inst) continue
      for (const t of negationTargets(state, inst)) negated.add(tokenOf(inst, t))
    }
    result = evaluate(negated)
    // Report only negations whose source was live in this final evaluation.
  }

  // ── Analysis: what the cancellations changed, versus a board where nothing was cancelled ──
  // The baseline keeps every card live (duplicates included) and ignores every negation. Whatever
  // differs between it and the real result, and every application that never happened because its
  // source was knocked out or negated, is reported so the players can see exactly what is (and
  // is not) changing. Same engine, run a second time — nothing is undone, only compared.
  const baseline = evaluate(new Set(), true)
  const nameOf = (side, b) => b.data.name ?? makeBoardCard(b.data, side, b.roundIndex).name
  const refOf = (side, b) => ({ side, ctoonId: b.data.ctoonId ?? b.data.id, name: nameOf(side, b), round: b.data.round ?? null, slot: Number.isInteger(b.data.slot) ? b.data.slot : null })
  const boardByKey = new Map() // `${side}:${roundIndex}` -> board entry (goal auras are not on the board)
  for (const side of ['player1', 'player2']) for (const b of boards[side]) boardByKey.set(`${side}:${b.roundIndex}`, b)

  const knockedOut = []
  for (const side of ['player1', 'player2']) for (const b of boards[side]) if (isDuplicate(b)) knockedOut.push(refOf(side, b))

  // Why a card is dead: a duplicate, or negated by these live cards.
  const causesOf = (side, roundIndex, adjacency = false) => {
    const b = boardByKey.get(`${side}:${roundIndex}`)
    if (b && isDuplicate(b)) return [{ kind: 'duplicate' }]
    const hit = [...(result.hits.get(`${side}:${roundIndex}`) || []), ...(adjacency ? (result.hits.get(`${side}:${roundIndex}#adj`) || []) : [])]
    if (!hit.length) return null
    return hit.map(h => ({ kind: 'negated', by: { side: h.inst.ownerSide, ctoonId: h.inst.sourceCard.ctoonId, name: h.inst.sourceCard.name } }))
  }
  const negatedCards = []
  for (const key of negated) {
    if (key.endsWith('#adj')) continue // partial: shows up under lostEffects/changes, not as a fully cancelled card
    const [side, ri] = [key.split(':')[0], Number(key.split(':')[1])]
    const b = boardByKey.get(key)
    if (!b || isDuplicate(b)) continue
    negatedCards.push({ ...refOf(side, b), causes: causesOf(side, ri) || [] })
  }

  // Applications the baseline made whose source is dead in the real result.
  const lostEffects = []
  for (const e of [...baseline.log.color, ...baseline.log.value]) {
    if (e.sourceIndex < 0) continue // goal-card aura: always live
    const causes = causesOf(e.source, e.sourceIndex, e.adjacency)
    if (!causes) continue
    lostEffects.push({ ...e, causes })
  }

  const byOrigin = (st) => { const m = new Map(); for (const side of ['player1', 'player2']) for (const c of st.sides[side]) m.set(c.origin, c); return m }
  const baseCards = byOrigin(baseline.state)
  const finalCards = byOrigin(result.state)
  const changes = []
  for (const side of ['player1', 'player2']) {
    for (const b of boards[side]) {
      const was = baseCards.get(b)
      const now = finalCards.get(b)
      const toValue = now ? now.value : 0
      const toColor = now ? now.color : was.color
      if (was.value === toValue && was.color === toColor) continue
      const reasons = []
      if (!now) reasons.push({ kind: 'duplicate' })
      for (const l of lostEffects) {
        if (l.targetPlayer === side && l.targetIndex === b.roundIndex) {
          reasons.push({ kind: 'lostEffect', sourceName: l.sourceName ?? null, sourceCtoonId: l.sourceCtoonId, action: l.action, operation: l.operation, amount: l.amount, color: l.color, causes: l.causes })
        }
      }
      changes.push({ ...refOf(side, b), fromValue: was.value, toValue, fromColor: was.color, toColor, cancelled: !now, reasons })
    }
  }
  // Name the sources of lost effects (the baseline log only carries ids).
  const nameByCtoon = new Map()
  for (const side of ['player1', 'player2']) for (const b of boards[side]) nameByCtoon.set(b.data.ctoonId ?? b.data.id, nameOf(side, b))
  for (const l of lostEffects) { l.sourceName = nameByCtoon.get(l.sourceCtoonId) ?? null; l.targetName = nameByCtoon.get(l.targetCtoonId) ?? null }
  for (const c of changes) for (const r of c.reasons) if (r.kind === 'lostEffect') r.sourceName = nameByCtoon.get(r.sourceCtoonId) ?? null

  const analysis = { knockedOut, negated: negatedCards, lostEffects, changes }

  // Assemble output in the original reveal order, with knocked-out cards scoring 0.
  const effectsResolved = []
  for (const side of ['player1', 'player2']) {
    for (const b of boards[side]) {
      if (!isDuplicate(b)) continue
      effectsResolved.push({
        source: side, sourceCtoonId: b.data.ctoonId ?? b.data.id, sourceRound: b.data.round,
        action: 'duplicateCancelled',
        targetPlayer: side, targetCtoonId: b.data.ctoonId ?? b.data.id, targetRound: b.data.round
      })
    }
  }
  effectsResolved.push(...result.log.negate, ...result.log.color, ...result.log.value)

  const finalBySide = {}
  for (const side of ['player1', 'player2']) {
    const byOrigin = new Map(result.state.sides[side].map(c => [c.origin, c]))
    finalBySide[side] = boards[side].map((b) => {
      const c = byOrigin.get(b)
      if (!c) {
        const base = makeBoardCard(b.data, side, b.roundIndex)
        return { ctoonId: base.ctoonId, round: base.round, baseValue: base.baseValue, finalValue: 0, color: base.color, cancelled: true }
      }
      return { ctoonId: c.ctoonId, round: c.round, baseValue: c.baseValue, finalValue: c.value, color: c.color, cancelled: false }
    })
  }
  return {
    player1: { revealed: finalBySide.player1, totalValue: finalBySide.player1.reduce((n, c) => n + c.finalValue, 0) },
    player2: { revealed: finalBySide.player2, totalValue: finalBySide.player2.reduce((n, c) => n + c.finalValue, 0) },
    effectsResolved,
    analysis
  }
}
