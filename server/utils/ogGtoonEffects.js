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
//     adjacencyMode?: 'linear' | 'graph',  // neighborOwn — see ADJACENCY_GRAPH below; default 'linear'
//     scope?: 'own' | 'opponent' | 'both', // allMatching
//     filters?: [{ by: 'type'|'color'|'group'|'value', value }, ...], // allMatching (AND'ed)
//     excludeSelf?: boolean                // allMatching — omit the source card itself
//   },
//   condition?: {
//     type: 'characterInPlay' | 'typeInPlay' | 'groupInPlay' | 'colorInPlay' | 'valueInPlay' |
//           'targetLacksType',
//     side?: 'own' | 'opponent' | 'either', // board-scan conditions only (not targetLacksType)
//     character?, cardType?, group?, color?, value?   // one of these per condition.type
//     adjacentOnly?: boolean,              // "next to X" — see design notes below
//     adjacencyMode?: 'linear' | 'graph'   // adjacentOnly only — see ADJACENCY_GRAPH; default 'linear'
//   },
//   action: {
//     type: 'modifyValue' | 'setColor' | 'negateEffect',
//     operation?: 'add' | 'multiply' | 'set',
//     amount?: number,
//     perMatch?: {                          // "+N for each X in play" aggregation
//       by?: 'type'|'color'|'group'|'character', value?,   // shorthand single clause
//       filters?: [{ by, value }, ...],      // or an explicit AND'ed list (e.g. "Female Animal")
//       scope: 'own' | 'opponent' | 'both' | 'neighborOwn',
//       adjacencyMode?: 'linear' | 'graph'   // neighborOwn scope only; default 'linear'
//     },
//     color?: string
//   }
// }
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
//   - `adjacencyMode` (on `neighborOwn` targets, `adjacentOnly` conditions, and `perMatch` with
//     `scope: 'neighborOwn'`) picks which notion of "neighbor" `neighborsOf()` uses. Default/
//     omitted is `'linear'` — strict roundIndex ±1, the original behavior, byte-for-byte
//     unchanged for every effect that doesn't set this field. `'graph'` instead looks up
//     ADJACENCY_GRAPH, a richer 7-node-per-side adjacency graph (ported from the original 2002
//     game's physical board topology) where a card can have up to 4 neighbors spanning multiple
//     "batches" of the match, not just its immediate prev/next reveal. This is opt-in by design:
//     it was added alongside existing catalog content that already relies on strict prev/next
//     semantics, and flipping the default would silently re-balance every one of those powers.
//   - Duplicate-character cancellation (phase 0, below) and the `setColor` cascade (phase 2) are
//     the other two mechanics ported from the original game — see their own inline comments in
//     `resolveFinalBoard`. Deliberately NOT ported: the original's "invert my neighbor's effect"
//     mechanic — it doesn't fit this schema's action taxonomy (negate/setColor/modifyValue) and
//     would need a new action type with cross-instance mutation semantics to express correctly.
//
// ── Resolution order (final board pass) — read this before changing phase ordering ─────────
//   0. Duplicate-character cancellation: for every cross-side pair of cards sharing a character,
//      the lower-BASE-value one is destroyed (an exact tie destroys both). Runs against PRINTED
//      values, before any effect fires — a cancelled card's own effects never activate, and it is
//      invisible to every other card's scope/condition/target scan for the rest of this pass. It
//      still appears in the returned `revealed` list (tagged `cancelled: true`, `finalValue: 0`)
//      so the match log/UI can show it was destroyed rather than silently dropping it.
//   1. Collect every active effect instance: both (non-cancelled) sides' `onReveal` effects on
//      EVERY card they revealed the whole match, plus `static` effects from either player's goal
//      card (always active once a match starts).
//   2. Negations first — `negateEffect` suppresses the TARGET card's own effect instances for the
//      rest of this pass (a negated card's onReveal/static effects never fire in this call).
//   3. Color changes next — `setColor`, player1's effects before player2's, run in a bounded
//      cascade: every pass re-checks every setColor instance's condition against CURRENT colors
//      (so one card's color change can flip another's condition, including on a later pass) and
//      applies only actual changes, stopping at a fixed point (a pass with zero changes) or after
//      MAX_COLOR_PASSES, whichever comes first — the cap guards against a malformed or
//      intentionally-oscillating admin-authored pair of effects looping forever.
//   4. Value modifications last, sub-ordered set -> multiply -> add; within each operation
//      bucket, player1's effects resolve before player2's. `perMatch`/`allMatching` effects slot
//      into whichever operation-type bucket their `action.operation` specifies, exactly like any
//      other `modifyValue` effect — they are not a separate phase. Runs once, after colors have
//      fully stabilized from phase 3.
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

/** `adjacencyMode: 'graph'` neighbor graph, roundIndex 0-6 -> neighbor roundIndexes. Translated
 *  index-for-index from the original 2002 game's 7-node-per-side board (its play-order nodes
 *  1,3,5,7,9,11,13 map onto our roundIndex 0-6 in order). Undirected, 11 edges. */
const ADJACENCY_GRAPH = {
  0: [1, 4], 1: [0, 2, 4, 5], 2: [1, 3, 5, 6], 3: [2, 6],
  4: [0, 1, 5], 5: [1, 2, 4, 6], 6: [2, 3, 5]
}

const ADJACENCY_MODES = new Set(['linear', 'graph'])

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
  if (!['type', 'color', 'group', 'value', 'character'].includes(f.by)) return false
  if (f.by === 'type' && !CARD_TYPES.has(f.value)) return false
  if (f.by === 'color' && !COLORS.has(f.value)) return false
  if (f.by === 'group' && !GROUPS.has(f.value)) return false
  if (f.by === 'value' && typeof f.value !== 'number') return false
  if (f.by === 'character' && typeof f.value !== 'string') return false
  return true
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
  if (sel === 'cardByCharacter' && typeof t.character !== 'string') return false
  if (sel === 'neighborOwn') {
    if (t.positions != null) {
      if (!Array.isArray(t.positions) || t.positions.length === 0) return false
      if (!t.positions.every(p => p === 'prev' || p === 'next')) return false
    }
    if (t.filter != null) {
      const filters = Array.isArray(t.filter?.filters) ? t.filter.filters : [t.filter]
      if (!areFiltersValid(filters)) return false
    }
    if (t.adjacencyMode != null && !ADJACENCY_MODES.has(t.adjacencyMode)) return false
  }
  if (sel === 'allMatching') {
    if (t.scope && !['own', 'opponent', 'both'].includes(t.scope)) return false
    if (!areFiltersValid(t.filters)) return false
    if (t.excludeSelf != null && typeof t.excludeSelf !== 'boolean') return false
  }
  if (e.condition) {
    const c = e.condition
    const validTypes = ['characterInPlay', 'typeInPlay', 'groupInPlay', 'colorInPlay', 'valueInPlay', 'targetLacksType']
    if (!validTypes.includes(c.type)) return false
    if (c.side && !['own', 'opponent', 'either'].includes(c.side)) return false
    if (c.type === 'characterInPlay' && typeof c.character !== 'string') return false
    if (c.type === 'typeInPlay' && !CARD_TYPES.has(c.cardType)) return false
    if (c.type === 'groupInPlay' && !GROUPS.has(c.group)) return false
    if (c.type === 'colorInPlay' && !COLORS.has(c.color)) return false
    if (c.type === 'valueInPlay' && typeof c.value !== 'number') return false
    if (c.type === 'targetLacksType' && !CARD_TYPES.has(c.cardType)) return false
    if (c.adjacentOnly != null && typeof c.adjacentOnly !== 'boolean') return false
    if (c.adjacencyMode != null && !ADJACENCY_MODES.has(c.adjacencyMode)) return false
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
      if (pm.adjacencyMode != null && !ADJACENCY_MODES.has(pm.adjacencyMode)) return false
    }
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
    case 'type': return cardTypes(card).includes(clause.value)
    case 'color': return card.color === clause.value
    case 'group': return card.group === clause.value
    case 'value': return card.baseValue === clause.value // always printed value, see header
    case 'character': return (card.characters || []).includes(clause.value)
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

function neighborsOf(sides, side, roundIndex, positions, mode) {
  const list = revealedOf(sides, side)
  if (mode === 'graph') {
    return (ADJACENCY_GRAPH[roundIndex] || [])
      .map(i => list.find(c => c.roundIndex === i))
      .filter(Boolean)
  }
  const pos = positions && positions.length ? positions : ['prev', 'next']
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

function conditionMet(inst, sides, targetCard) {
  const cond = inst.effect.condition
  if (!cond) return true

  if (cond.type === 'targetLacksType') {
    if (!targetCard) return false
    return !cardTypes(targetCard).includes(cond.cardType)
  }

  // "next to X" — the source card's own adjacent (prev/next round-index, or graph-adjacent —
  // see ADJACENCY_GRAPH — if cond.adjacencyMode is 'graph') cards on its own side.
  if (cond.adjacentOnly) {
    const neighbors = neighborsOf(sides, inst.ownerSide, inst.sourceCard.roundIndex, cond.positions, cond.adjacencyMode)
    if (cond.type === 'characterInPlay') return neighbors.some(c => (c.characters || []).includes(cond.character))
    if (cond.type === 'typeInPlay') return neighbors.some(c => cardTypes(c).includes(cond.cardType))
    if (cond.type === 'groupInPlay') return neighbors.some(c => c.group === cond.group)
    if (cond.type === 'colorInPlay') return neighbors.some(c => c.color === cond.color)
    if (cond.type === 'valueInPlay') return neighbors.some(c => c.baseValue === cond.value)
    return false
  }

  const side = cond.side || 'either'
  const opponentSide = inst.ownerSide === 'player1' ? 'player2' : 'player1'
  let pool
  if (side === 'own') pool = revealedOf(sides, inst.ownerSide)
  else if (side === 'opponent') pool = revealedOf(sides, opponentSide)
  else pool = [...revealedOf(sides, 'player1'), ...revealedOf(sides, 'player2')]

  switch (cond.type) {
    case 'characterInPlay': return pool.some(c => (c.characters || []).includes(cond.character))
    case 'typeInPlay': return pool.some(c => cardTypes(c).includes(cond.cardType))
    case 'groupInPlay': return pool.some(c => c.group === cond.group)
    case 'colorInPlay': return pool.some(c => c.color === cond.color)
    case 'valueInPlay': return pool.some(c => c.baseValue === cond.value)
    default: return true
  }
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
          if ((c.characters || []).includes(inst.effect.target.character)) targets.push(wrap(c))
        }
      }
      return targets
    }
    case 'neighborOwn': {
      const neighbors = neighborsOf(sides, ownerSide, inst.sourceCard.roundIndex, inst.effect.target.positions, inst.effect.target.adjacencyMode)
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
        matched = matched.filter(c => !(c.side === inst.sourceCard.side && c.roundIndex === inst.sourceCard.roundIndex))
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
  else if (pm.scope === 'neighborOwn') pool = neighborsOf(sides, ownerSide, inst.sourceCard.roundIndex, null, pm.adjacencyMode)
  else pool = [...revealedOf(sides, 'player1'), ...revealedOf(sides, 'player2')]
  return pool.filter(c => cardMatchesFilters(c, filters)).length
}

function charactersOverlap(a, b) {
  if (!a || !b || !a.length || !b.length) return false
  const set = new Set(a)
  return b.some(name => set.has(name))
}

/**
 * Phase 0 — duplicate-character cancellation (feature 5). Cross-side only: a single deck can't
 * contain two cards sharing a character (enforced at deck-save time, see decks.post.js), so same-
 * side pairs can never occur. For every cross-side pair sharing a character, compares PRINTED
 * (baseValue) scores — the lower one is cancelled; an exact tie cancels both. Mirrors the
 * reference game's resolveCancels: each pairwise comparison is independent (not chained), so a
 * card already cancelled by one match still participates in — and can cause — other matches.
 * Mutates `.cancelled` on the losing card(s) in place. Returns the list of cancellation events
 * (`{ card, other }`) for the caller to fold into `effectsResolved`.
 */
function markCancelledPairs(p1Cards, p2Cards) {
  const events = []
  for (const a of p1Cards) {
    for (const b of p2Cards) {
      if (!charactersOverlap(a.characters, b.characters)) continue
      if (a.baseValue < b.baseValue) {
        a.cancelled = true
        events.push({ card: a, other: b })
      } else if (b.baseValue < a.baseValue) {
        b.cancelled = true
        events.push({ card: b, other: a })
      } else {
        a.cancelled = true
        b.cancelled = true
        events.push({ card: a, other: b })
        events.push({ card: b, other: a })
      }
    }
  }
  return events
}

/**
 * Resolves the FINAL board for a completed match (round 7, or the deciding sudden-death round).
 * This is the single authoritative effects pass — see module header for resolution order and
 * the design notes on every new mechanic.
 *
 * @param {object} params
 * @param {object} params.player1 - { revealed: [cardSnapshot, ...], goalCard: cardSnapshot|null }
 * @param {object} params.player2 - same shape
 *   cardSnapshot: { ctoonId, name, characters, color, value, type1, type2, type3, group, isSlam,
 *                    effect, round } — `round` is only used for the returned log entries, NOT
 *                    for neighbor adjacency (which uses array order / roundIndex, so sudden-death
 *                    rounds still chain correctly onto round 7).
 * @returns {{ player1: { revealed: [{ctoonId,round,baseValue,finalValue,color}], totalValue },
 *             player2: {...}, effectsResolved: object[] }}
 */
export function resolveFinalBoard({ player1, player2 }) {
  // roundIndex is assigned here, against the ORIGINAL (unfiltered) array position, and never
  // recomputed after cancellation below — so a cancelled card's slot is simply "empty" rather
  // than compacting and creating false new adjacencies between the cards on either side of it.
  const allCards = {
    player1: (player1.revealed || []).map((c, i) => makeBoardCard(c, 'player1', i)),
    player2: (player2.revealed || []).map((c, i) => makeBoardCard(c, 'player2', i))
  }

  const effectsResolved = []

  // Phase 0: duplicate-character cancellation — see markCancelledPairs and the module header.
  const cancelEvents = markCancelledPairs(allCards.player1, allCards.player2)
  for (const ev of cancelEvents) {
    effectsResolved.push({
      source: ev.card.side, sourceCtoonId: ev.card.ctoonId, sourceRound: ev.card.round,
      action: 'cancel', targetPlayer: ev.other.side, targetCtoonId: ev.other.ctoonId, targetRound: ev.other.round
    })
  }

  // Every phase below operates on the FILTERED (non-cancelled) lists — cancelled cards' own
  // effects never enter `instances`, and they're invisible to every other card's scope/
  // condition/target scan. `allCards` (unfiltered) is kept aside for the final output.
  const sides = {
    player1: allCards.player1.filter(c => !c.cancelled),
    player2: allCards.player2.filter(c => !c.cancelled)
  }

  const goalAuras = []
  if (player1.goalCard) goalAuras.push({ card: makeBoardCard(player1.goalCard, 'player1', -1), side: 'player1' })
  if (player2.goalCard) goalAuras.push({ card: makeBoardCard(player2.goalCard, 'player2', -1), side: 'player2' })

  const instances = []
  for (const side of ['player1', 'player2']) {
    for (const card of sides[side]) {
      for (const eff of card.effects) {
        if (eff.trigger === 'onReveal') instances.push({ ownerSide: side, sourceCard: card, effect: eff })
      }
    }
  }
  for (const aura of goalAuras) {
    for (const eff of aura.card.effects) {
      if (eff.trigger === 'static') instances.push({ ownerSide: aura.side, sourceCard: aura.card, effect: eff })
    }
  }

  const suppressed = new Set()
  const isSuppressed = (card) => suppressed.has(`${card.side}:${card.roundIndex}`)

  // 1) Negations
  for (const inst of instances) {
    if (inst.effect.action.type !== 'negateEffect') continue
    if (isSuppressed(inst.sourceCard)) continue
    for (const t of resolveTargets(inst, sides)) {
      if (!conditionMet(inst, sides, t.card)) continue
      suppressed.add(t.key)
      effectsResolved.push({
        source: inst.ownerSide, sourceCtoonId: inst.sourceCard.ctoonId, sourceRound: inst.sourceCard.round,
        action: 'negateEffect', targetPlayer: t.side, targetCtoonId: t.card.ctoonId, targetRound: t.card.round
      })
    }
  }

  // 2) Color changes — bounded cascade (feature 6). Every pass re-checks every setColor
  // instance's condition against CURRENT colors and applies only actual changes, player1 before
  // player2 within a pass; stops at a fixed point (a pass with zero changes) or MAX_COLOR_PASSES,
  // whichever comes first. See module header for why this is scoped to setColor only.
  const MAX_COLOR_PASSES = 10
  for (let pass = 0; pass < MAX_COLOR_PASSES; pass++) {
    let changed = false
    for (const side of ['player1', 'player2']) {
      for (const inst of instances) {
        if (inst.ownerSide !== side) continue
        if (inst.effect.action.type !== 'setColor') continue
        if (isSuppressed(inst.sourceCard)) continue
        for (const t of resolveTargets(inst, sides)) {
          if (!conditionMet(inst, sides, t.card)) continue
          if (t.card.color === inst.effect.action.color) continue
          t.card.color = inst.effect.action.color
          changed = true
          effectsResolved.push({
            source: inst.ownerSide, sourceCtoonId: inst.sourceCard.ctoonId, sourceRound: inst.sourceCard.round,
            action: 'setColor', color: inst.effect.action.color,
            targetPlayer: t.side, targetCtoonId: t.card.ctoonId, targetRound: t.card.round
          })
        }
      }
    }
    if (!changed) break
  }

  // 3) Value mods — set, then multiply, then add; player1 before player2 within each
  for (const op of ['set', 'multiply', 'add']) {
    for (const side of ['player1', 'player2']) {
      for (const inst of instances) {
        if (inst.ownerSide !== side) continue
        if (inst.effect.action.type !== 'modifyValue') continue
        if (inst.effect.action.operation !== op) continue
        if (isSuppressed(inst.sourceCard)) continue

        const pm = inst.effect.action.perMatch
        let matchCount = null
        if (pm) {
          matchCount = countPerMatch(inst, sides, pm)
          if (matchCount === 0) continue // nothing to apply "once per" — see module header
        }

        for (const t of resolveTargets(inst, sides)) {
          if (!conditionMet(inst, sides, t.card)) continue
          const before = t.card.value
          const effectiveAmount = pm ? inst.effect.action.amount * matchCount : inst.effect.action.amount
          if (op === 'set') t.card.value = effectiveAmount
          else if (op === 'multiply') t.card.value = t.card.value * effectiveAmount
          else t.card.value = t.card.value + effectiveAmount
          effectsResolved.push({
            source: inst.ownerSide, sourceCtoonId: inst.sourceCard.ctoonId, sourceRound: inst.sourceCard.round,
            action: 'modifyValue', operation: op, amount: effectiveAmount,
            ...(pm ? { perMatchCount: matchCount, perMatchAmount: inst.effect.action.amount } : {}),
            targetPlayer: t.side, targetCtoonId: t.card.ctoonId, targetRound: t.card.round,
            valueBefore: before, valueAfter: t.card.value
          })
        }
      }
    }
  }

  // Final output uses allCards (unfiltered) so cancelled cards still appear in the log, at
  // finalValue 0, rather than disappearing.
  const toEntry = (c) => ({
    ctoonId: c.ctoonId, round: c.round, baseValue: c.baseValue,
    finalValue: c.cancelled ? 0 : c.value, color: c.color, cancelled: !!c.cancelled
  })
  return {
    player1: {
      revealed: allCards.player1.map(toEntry),
      totalValue: allCards.player1.reduce((s, c) => s + (c.cancelled ? 0 : c.value), 0)
    },
    player2: {
      revealed: allCards.player2.map(toEntry),
      totalValue: allCards.player2.reduce((s, c) => s + (c.cancelled ? 0 : c.value), 0)
    },
    effectsResolved
  }
}
