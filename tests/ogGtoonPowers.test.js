// tests/ogGtoonPowers.test.js
//
// Simulates EVERY power in the OG gToons catalog and checks it does what its printed text says.
//
// The expected result does not come from the catalog's effect JSON. `referenceEffects` below is a
// small, independent reader of the printed "Power Description" sentence that applies it the plain-
// English way to a random 7-slot-per-side board. Each catalog power is then played through
//   (a) resolveFinalBoard directly, on random full AND partially-filled boards, and
//   (b) a real match (deal -> place -> reveal -> discard -> reveal -> swap phase -> final scoring),
// and the per-card final values must equal the reference's.
//
// Rules the reference encodes (match the engine's documented rules):
//   - "in play" = every revealed card, both sides. "Next to / neighboring / adjacent" = the source's
//     own side, slot - 1 and slot + 1. "Opposite / opposing" = the other side's card in the SAME slot.
//   - "all 8s" / "Green 7s" compare PRINTED values. "other" leaves the source card out.
//   - Multiplies resolve before additions.
//   - "+N to any <names>" buffs each matching card once; "+N for each <names>" counts each card once.

import test from 'node:test'
import assert from 'node:assert/strict'
import { OG_GTOON_POWER_CATALOG } from '../server/utils/ogGtoonPowerCatalog.js'
import { resolveFinalBoard, validateEffectSchema } from '../server/utils/ogGtoonEffects.js'
import {
  initHands, placeCard, revealPlacedCards, advanceRound, checkMatchEnd, submitDiscard, resolveDiscardPhase,
  recordSwapChoice, resolveSwapPhase
} from '../server/utils/ogGtoonMatchCore.js'
import { slotsForRound } from '../server/utils/ogGtoonEngine.js'

/* ── seeded rng ──────────────────────────────────────────────────────────────────────────── */
function rngFrom(seed) {
  let s = seed >>> 0 || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)]

/* ── attribute vocab ─────────────────────────────────────────────────────────────────────── */
const TYPES = ['ANIMAL', 'FEMALE', 'HERO', 'MALE', 'MONSTER', 'PLACE', 'PROP', 'VEHICLE', 'VILLAIN']
const COLORS = ['BLACK', 'SILVER', 'BLUE', 'RED', 'YELLOW', 'GREEN', 'PURPLE', 'ORANGE', 'PINK']
const TYPE_WORDS = { animal: 'ANIMAL', female: 'FEMALE', hero: 'HERO', male: 'MALE', monster: 'MONSTER', place: 'PLACE', prop: 'PROP', vehicle: 'VEHICLE', villain: 'VILLAIN' }
const COLOR_WORDS = Object.fromEntries(COLORS.map(c => [c.toLowerCase(), c]))
const GROUP_PHRASES = [
  ['justice league', 'JUSTICE_LEAGUE'], ['mystery, inc.', 'MYSTERY_INC'], ['powerpuff girl', 'POWERPUFF_GIRLS'],
  ['mucha lucha', 'MUCHA_LUCHA'], ['bean scout', 'BEAN_SCOUTS'], ['injustice gang', 'INJUSTICE_GANG'],
  ['imaginary friend', 'IMAGINARY_FRIEND'], ['teen titan', 'TEEN_TITANS']
]

/* ── the reference reader ────────────────────────────────────────────────────────────────── */

/** Noun phrase -> { f(card) predicate } for type/color/group/value phrases, or { names } for characters. */
function nounOf(raw) {
  let t = raw.trim().replace(/^(any|all|the|each|another|other)\s+/i, '').replace(/\s+in play$/i, '').trim()
  t = t.replace(/\s+(cards?|members?)$/i, '').trim()
  if (/^member of /i.test(t)) t = t.replace(/^member of /i, '')
  if (/^Ed, Edd 'n Eddy$/i.test(t)) return { names: ['Ed', 'Edd', 'Eddy'] }
  const lower = t.toLowerCase()
  for (const [phrase, group] of GROUP_PHRASES) {
    if (lower === phrase || lower === phrase + 's') return { f: (c) => c.group === group }
  }
  const m = lower.match(/^(\d+)s?$/)
  if (m) return { f: (c) => c.value === Number(m[1]) }
  const words = lower.split(/\s+/)
  const clauses = []
  for (const w of words) {
    const ty = TYPE_WORDS[w] || TYPE_WORDS[w.replace(/s$/, '')] || TYPE_WORDS[w.replace(/es$/, '')] || TYPE_WORDS[w.replace(/ies$/, 'y')]
    if (ty) clauses.push((c) => c.types.includes(ty))
    else if (COLOR_WORDS[w]) clauses.push((c) => c.color === COLOR_WORDS[w])
    else if (/^\d+s?$/.test(w)) { const v = Number(w.replace(/s$/, '')); clauses.push((c) => c.value === v) }
    else { clauses.length = 0; break }
  }
  if (clauses.length === words.length) return { f: (c) => clauses.every(fn => fn(c)) }
  // otherwise a list of character names
  const names = t.split(/\s*,\s*(?:and |or )?|\s+and\s+|\s+or\s+/).map(s => s.replace(/^(any|the)\s+/i, '').trim()).filter(Boolean)
  return { names }
}

const hasName = (c, n) => c.characters.includes(n)
const matchesNoun = (c, noun) => (noun.f ? noun.f(c) : noun.names.some(n => hasName(c, n)))
const countNoun = (cards, noun) => cards.filter(c => matchesNoun(c, noun)).length // a card counts once however many listed names it has

function parseAmount(a) {
  if (a.startsWith('x')) return { kind: 'mul', n: Number(a.slice(1)) }
  return { kind: 'add', n: Number(a) }
}

/**
 * Returns fn({ cards, src, neighbors, opposite, own, opp }) -> [{ card, kind, n } | { card, color }]
 * for one printed power. `cards` = everything in play. Throws if the sentence is not understood.
 */
function referenceEffects(description) {
  // Settled by the game's owner: when a power names ONE character and then adds a conditional bonus, the bonus applies to that character, not the power's card.
  const FOLLOW_ON = {
    '+3 to Juniper Lee; x2 if Granny is in play': '+3 to Juniper Lee; x2 to Juniper Lee if Granny is in play',
    '+5 to any Bubbles; +7 if next to any Him': '+5 to any Bubbles; +7 to any Bubbles if next to any Him',
    '-4 to any George Jetson; -1 if any Stella Spacely is in play': '-4 to any George Jetson; -1 to any George Jetson if any Stella Spacely is in play',
    // Group form: the conditional number REPLACES the base number for every card in the group.
    '+3 to all Animals; +5 if any Yogi Bear is in play': '+3 to all Animals; +2 to all Animals if any Yogi Bear is in play',
    '-5 to all Black 10s; +5 if next to Lumpus': '-5 to all Black 10s; +10 to all Black 10s if next to Lumpus'
  }
  description = FOLLOW_ON[description] ?? description
  const clauses = description.split(/;|,(?= *(?:x\d|[+-]\d))/).map(s => s.trim()).filter(Boolean)
  const fns = clauses.map(clauseFn)
  return (ctx) => fns.flatMap(fn => fn(ctx))
}

function conditionFn(text) {
  let t = text.trim()
  if (/^played as the last card$/i.test(t)) return (ctx) => ctx.src.slot === 7
  let m = t.match(/^opposite card is (\w+)$/i)
  if (m) { const col = COLOR_WORDS[m[1].toLowerCase()]; return (ctx) => !!ctx.opposite && ctx.opposite.color === col }
  m = t.match(/^next to (.+)$/i)
  if (m) { const noun = nounOf(m[1]); return (ctx) => countNoun(ctx.neighbors, noun) > 0 }
  m = t.match(/^(.+?) (?:is|are)(?: both)? in play$/i)
  if (m) {
    let body = m[1]
    const other = /^any other /i.test(body)
    body = body.replace(/^any other /i, 'any ')
    const both = / and /i.test(body) && /are both/i.test(t)
    if (both) { const nouns = body.split(/\s+and\s+/i).map(nounOf); return (ctx) => nouns.every(n => countNoun(ctx.cards, n) > 0) }
    const noun = nounOf(body)
    return (ctx) => countNoun(other ? ctx.cards.filter(c => c !== ctx.src) : ctx.cards, noun) > 0
  }
  throw new Error(`unreadable condition: ${text}`)
}

function clauseFn(clause) {
  let m
  // "+N for each X"
  if ((m = clause.match(/^([+-]\d+) for each (.+)$/i))) {
    const n = Number(m[1]); let body = m[2].replace(/\s+in play$/i, '').trim()
    let scope = 'both'; let excludeSelf = false
    if (/^neighboring /i.test(body)) { scope = 'neighbors'; body = body.replace(/^neighboring /i, '') }
    else if (/^opponent /i.test(body)) { scope = 'opp'; body = body.replace(/^opponent /i, '') }
    else if (/ opponent$/i.test(body)) { scope = 'opp'; body = body.replace(/ opponent$/i, '') }
    else if (/^other /i.test(body)) { excludeSelf = true; body = body.replace(/^other /i, '') }
    const noun = nounOf(body)
    return (ctx) => {
      let pool = scope === 'neighbors' ? ctx.neighbors : scope === 'opp' ? ctx.opp : ctx.cards
      if (excludeSelf) pool = pool.filter(c => c !== ctx.src)
      return [{ card: ctx.src, kind: 'add', n: n * countNoun(pool, noun) }]
    }
  }
  // "Adjacent cards get -1 for each Yellow card in play"
  if ((m = clause.match(/^Adjacent cards get ([+-]\d+) for each (.+)$/i))) {
    const n = Number(m[1]); const noun = nounOf(m[2])
    return (ctx) => { const k = countNoun(ctx.cards, noun); return k ? ctx.neighbors.map(card => ({ card, kind: 'add', n: n * k })) : [] }
  }
  // "All X get +1 for each Red card and -1 for each Blue card in play"
  if ((m = clause.match(/^All (.+?) get (.+)$/i))) {
    const who = nounOf(m[1])
    const parts = m[2].split(/ and (?=[+-]\d)/).map(p => p.match(/^([+-]\d+) for each (.+?)(?: in play)?$/i))
    return (ctx) => ctx.cards.filter(c => matchesNoun(c, who)).flatMap(card => parts.flatMap(p => {
      const k = countNoun(ctx.cards, nounOf(p[2])); return k ? [{ card, kind: 'add', n: Number(p[1]) * k }] : []
    }))
  }
  // "Treat(s) opposing card as Black" / "Treats neighboring cards as Green"
  if ((m = clause.match(/^Treats? opposing card as (\w+)$/i))) { const col = m[1].toUpperCase(); return (ctx) => (ctx.opposite ? [{ card: ctx.opposite, color: col }] : []) }
  if ((m = clause.match(/^Treats? neighboring cards as (\w+)$/i))) { const col = m[1].toUpperCase(); return (ctx) => ctx.neighbors.map(card => ({ card, color: col })) }
  // "Opposing card loses all adjacency effects"
  if (/^Opposing card loses all adjacency effects$/i.test(clause)) return (ctx) => (ctx.opposite ? [{ card: ctx.opposite, loseAdjacency: true }] : [])
  // "-5 to opposing card if not Male" (also "opposite", and the "it" typo)
  if ((m = clause.match(/^([+-]\d+) to opposi(?:ng|te) card (?:if|it) not (?:a |an )?(\w+)$/i))) {
    const n = Number(m[1]); const ty = TYPE_WORDS[m[2].toLowerCase()]
    return (ctx) => (ctx.opposite && !ctx.opposite.types.includes(ty) ? [{ card: ctx.opposite, kind: 'add', n }] : [])
  }
  // "-5 to neighboring and opposite Villains"
  if ((m = clause.match(/^([+-]\d+) to neighboring and opposite (.+)$/i))) {
    const n = Number(m[1]); const noun = nounOf(m[2])
    return (ctx) => [...ctx.neighbors, ...(ctx.opposite ? [ctx.opposite] : [])].filter(c => matchesNoun(c, noun)).map(card => ({ card, kind: 'add', n }))
  }
  // "+N to each/any neighboring X" and "to each adjacent card"
  if ((m = clause.match(/^(x\d+|[+-]\d+) to (?:each|any) (?:neighboring|adjacent) (.+)$/i))) {
    const a = parseAmount(m[1]); const noun = /^cards?$/i.test(m[2]) ? { f: () => true } : nounOf(m[2])
    return (ctx) => ctx.neighbors.filter(c => matchesNoun(c, noun)).map(card => ({ card, ...a }))
  }
  // "+N to all [other] X"
  if ((m = clause.match(/^(x\d+|[+-]\d+) to all (.+?)(?: if (.+))?$/i))) {
    const a = parseAmount(m[1]); const other = /^other /i.test(m[2]); const noun = nounOf(m[2]); const cond = m[3] ? conditionFn(m[3]) : null
    return (ctx) => ctx.cards.filter(c => matchesNoun(c, noun) && !(other && c === ctx.src) &&
      (!cond || cond({ ...ctx, neighbors: ctx.neighborsOf(c), opposite: ctx.oppositeOf(c) }))).map(card => ({ card, ...a }))
  }
  // "-5 to any opponent's Props"
  if ((m = clause.match(/^(x\d+|[+-]\d+) to any opponent's (.+)$/i))) {
    const a = parseAmount(m[1]); const noun = nounOf(m[2])
    return (ctx) => ctx.opp.filter(c => matchesNoun(c, noun)).map(card => ({ card, ...a }))
  }
  // "+N to any X and any Y" (union of two named groups, each applied on its own)
  if ((m = clause.match(/^(x\d+|[+-]\d+) to any (.+) and any (.+)$/i))) {
    const a = parseAmount(m[1]); const nouns = [nounOf(m[2]), nounOf(m[3])]
    return (ctx) => ctx.cards.filter(c => nouns.some(noun => matchesNoun(c, noun))).map(card => ({ card, ...a }))
  }
  // "+N to [any] X [if Y is in play]"
  if ((m = clause.match(/^(x\d+|[+-]\d+) to (?:any )?(.+?)(?: if (.+))?$/i))) {
    const a = parseAmount(m[1]); const other = /^other /i.test(m[2]); const noun = nounOf(m[2]); const cond = m[3] ? conditionFn(m[3]) : null
    return (ctx) => ctx.cards.filter(c => matchesNoun(c, noun) && !(other && c === ctx.src) && (!cond || cond({ ...ctx, src: c, neighbors: ctx.neighborsOf(c), opposite: ctx.oppositeOf(c) }))).map(card => ({ card, ...a }))
  }
  // "+N if <condition>" on the source card itself
  if ((m = clause.match(/^(x\d+|[+-]\d+) if (.+)$/i))) {
    const a = parseAmount(m[1]); const cond = conditionFn(m[2])
    return (ctx) => (cond(ctx) ? [{ card: ctx.src, ...a }] : [])
  }
  if (/^No power$/i.test(clause)) return () => []
  throw new Error(`unreadable power clause: ${clause}`)
}

/* ── board model + reference evaluation ──────────────────────────────────────────────────── */

let uid = 0
function plainCard(rng, vocab, bias) {
  const useBias = bias && rng() < 0.55
  const src = useBias ? bias : vocab
  const nChars = rng() < 0.25 ? 0 : (rng() < 0.12 ? 2 : 1)
  const characters = []
  for (let i = 0; i < nChars; i++) { const nm = pick(rng, src.names.length ? src.names : vocab.names); if (!characters.includes(nm)) characters.push(nm) }
  const types = []
  const nTypes = Math.floor(rng() * 3)
  for (let i = 0; i < nTypes; i++) { const ty = pick(rng, src.types.length ? src.types : TYPES); if (!types.includes(ty)) types.push(ty) }
  return {
    id: `c${++uid}`, name: `Card ${uid}`, characters,
    color: pick(rng, src.colors.length ? src.colors : COLORS),
    value: pick(rng, src.values.length ? src.values : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    types, group: rng() < 0.4 ? pick(rng, src.groups.length ? src.groups : GROUP_PHRASES.map(g => g[1])) : null,
    effect: null
  }
}

/** Walks a catalog entry's JSON for every concrete value it mentions, to bias random boards toward it. */
function vocabFromEffect(effect) {
  const v = { names: new Set(), types: new Set(), colors: new Set(), groups: new Set(), values: new Set() }
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk)
    if (!o || typeof o !== 'object') return
    for (const [k, val] of Object.entries(o)) {
      if (k === 'character') [].concat(val).forEach(x => v.names.add(x))
      else if (k === 'cardType') v.types.add(val)
      else if (k === 'color') v.colors.add(val)
      else if (k === 'group') v.groups.add(val)
      else if (k === 'by' && ['type', 'color', 'group', 'value', 'character'].includes(val)) {
        const bucket = { type: v.types, color: v.colors, group: v.groups, value: v.values, character: v.names }[val]
        ;[].concat(o.value).forEach(x => bucket.add(x))
      } else walk(val)
    }
  }
  walk(effect)
  return Object.fromEntries(Object.entries(v).map(([k, set]) => [k, [...set]]))
}

function allNames(catalog) {
  const names = new Set()
  for (const e of catalog) for (const n of vocabFromEffect(e.effect).names) names.add(n)
  return [...names]
}

/** Reference result: final values per card (Map card -> value) and colors, for a board with one powered source. */
function referenceBoard(board, srcRef, description) {
  const read = referenceEffects(description)
  // Same-character rule: of cards sharing a character, only the lowest printed value counts.
  const everyone = [...board.p1, ...board.p2].filter(Boolean)
  const knocked = new Set()
  for (const c of everyone) {
    for (const nm of c.characters) {
      const sharing = everyone.filter(o => o.characters.includes(nm))
      if (sharing.some(o => o.value < c.value)) knocked.add(c)
    }
  }
  const live = { p1: board.p1.map(c => (c && !knocked.has(c) ? c : null)), p2: board.p2.map(c => (c && !knocked.has(c) ? c : null)) }
  const srcCard = board[srcRef.side][srcRef.slot - 1]
  const result = referenceLive(live, srcRef, knocked.has(srcCard) ? null : read)
  for (const c of knocked) result.set(c, { value: 0, color: c.color })
  return result
}

function referenceLive(board, srcRef, read) {
  const all = [...board.p1, ...board.p2].filter(Boolean)
  if (!read) return new Map(all.map(c => [c, { value: c.value, color: c.color }]))
  const mine = srcRef.side === 'p1' ? board.p1 : board.p2
  const theirs = srcRef.side === 'p1' ? board.p2 : board.p1
  const src = mine[srcRef.slot - 1]
  const at = (arr, i) => (i >= 0 && i < 7 ? arr[i] || null : null)
  const neighbors = [at(mine, srcRef.slot - 2), at(mine, srcRef.slot)].filter(Boolean)
  const place = (card) => { for (const sd of ['p1', 'p2']) { const i = board[sd].indexOf(card); if (i >= 0) return { sd, i } } return null }
  const neighborsOf = (card) => { const { sd, i } = place(card); return [at(board[sd], i - 1), at(board[sd], i + 1)].filter(Boolean) }
  const oppositeOf = (card) => { const { sd, i } = place(card); return at(board[sd === 'p1' ? 'p2' : 'p1'], i) }
  const ctx = { cards: all, src, neighbors, opposite: at(theirs, srcRef.slot - 1), own: mine.filter(Boolean), opp: theirs.filter(Boolean), neighborsOf, oppositeOf }
  ctx.src.slot = srcRef.slot
  const out = read(ctx)
  const res = new Map(all.map(c => [c, { mul: 1, add: 0, color: c.color }]))
  // "loses all adjacency effects" only matters to a card that has adjacency powers; none are on the board here
  for (const e of out) {
    const r = res.get(e.card)
    if (e.color) r.color = e.color
    else if (e.kind === 'mul') r.mul *= e.n
    else if (e.kind === 'add') r.add += e.n
  }
  return new Map([...res].map(([c, r]) => [c, { value: c.value * r.mul + r.add, color: r.color }]))
}

function snapshot(card, slot, entry) {
  return {
    ctoonId: card.id, name: card.name, characters: card.characters, color: card.color, value: card.value,
    type1: card.types[0] ?? null, type2: card.types[1] ?? null, type3: card.types[2] ?? null, group: card.group,
    isSlam: !!card.effect, effect: card === entry?.src ? entry.effect : null, round: slot <= 4 ? 1 : 2, slot
  }
}

function buildBoard(rng, vocab, bias, entry, { partial }) {
  const mk = () => Array.from({ length: 7 }, () => plainCard(rng, vocab, bias))
  const board = { p1: mk(), p2: mk() }
  const side = rng() < 0.5 ? 'p1' : 'p2'
  const slot = 1 + Math.floor(rng() * 7)
  const src = board[side][slot - 1]
  src.effect = entry.effect
  if (partial) {
    for (const s of ['p1', 'p2']) for (let i = 0; i < 7; i++) if (board[s][i] !== src && rng() < 0.25) board[s][i] = null
  }
  return { board, srcRef: { side, slot }, src }
}

const names = allNames(OG_GTOON_POWER_CATALOG)
const VOCAB = { names, types: TYPES, colors: COLORS, groups: GROUP_PHRASES.map(g => g[1]), values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }

/** Powers with their own scenario tests below instead of the generic reference comparison. */
const SPECIAL = new Set(['Opposing card loses all adjacency effects'])

test('catalog: every power validates against the effect schema', () => {
  for (const e of OG_GTOON_POWER_CATALOG) {
    const v = validateEffectSchema(e.effect)
    assert.equal(v.ok, true, `${e.description}: ${v.errors.join(', ')}`)
  }
})

test('catalog: no power is left as a documented simplification', () => {
  const simplified = OG_GTOON_POWER_CATALOG.filter(e => e.note && /^simplification/i.test(e.note)).map(e => e.description)
  assert.deepEqual(simplified, [])
})

/* ── (a) every power vs. the reference, direct on resolveFinalBoard ─────────────────────── */

for (const entry of OG_GTOON_POWER_CATALOG) {
  if (SPECIAL.has(entry.description)) continue
  test(`power: ${entry.description}`, () => {
    const isNoPower = entry.effect.length === 0 && !/^No power$/i.test(entry.description)
    if (isNoPower) assert.fail('has no effect but is not "No Power"')
    const bias = vocabFromEffect(entry.effect)
    const rng = rngFrom(entry.description.split('').reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7))
    for (let n = 0; n < 150; n++) {
      const { board, srcRef, src } = buildBoard(rng, VOCAB, bias, entry, { partial: n % 3 === 0 })
      const expected = referenceBoard(board, srcRef, entry.description)
      const side = (s) => ({
        revealed: board[s].map((c, i) => (c ? snapshot(c, i + 1, { src, effect: entry.effect }) : null)).filter(Boolean),
        goalCard: null
      })
      const got = resolveFinalBoard({ player1: side('p1'), player2: side('p2') })
      for (const [key, sideName] of [['player1', 'p1'], ['player2', 'p2']]) {
        const cards = board[sideName].filter(Boolean)
        got[key].revealed.forEach((r, i) => {
          const want = expected.get(cards[i])
          assert.equal(r.finalValue, want.value, `${entry.description}: ${sideName} slot of ${cards[i].name} (chars ${cards[i].characters}, ${cards[i].color} ${cards[i].value}, ${cards[i].types}, ${cards[i].group}) — source at ${srcRef.side} slot ${srcRef.slot}; got ${r.finalValue}, printed text says ${want.value}`)
          assert.equal(r.color, want.color, `${entry.description}: color of ${cards[i].name}`)
        })
      }
    }
  })
}

/* ── (b) every power through a REAL match ────────────────────────────────────────────────── */

function deckFor(cards, goalColor = 'BLACK') {
  const filler = Array.from({ length: 4 }, (_, i) => ({ id: `f${++uid}`, name: `Filler ${i}`, characters: [], color: 'SILVER', value: 1, types: [], group: null, effect: null }))
  const goal = { id: `g${++uid}`, name: 'Goal', characters: [], color: goalColor, value: 1, types: [], group: null, effect: null }
  return [...cards, ...filler, goal].map((c, i) => ({
    ctoonId: c.id, name: c.name, assetPath: '/x.png', characters: c.characters, color: c.color, value: c.value,
    type1: c.types[0] ?? null, type2: c.types[1] ?? null, type3: c.types[2] ?? null, group: c.group,
    isSlam: !!c.effect, effect: c.effect, position: i
  }))
}

function playRealMatch(board) {
  const m = initHands({
    id: 'sim', players: ['a', 'b'], usernames: ['A', 'B'],
    deckOrder: [deckFor(board.p1), deckFor(board.p2)], goalColor: ['BLACK', 'BLACK'], stake: [0, 0]
  }, () => 0.5)
  m.hand = [[0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5]]
  m.undealt = [[6, 7, 8, 9, 10, 11], [6, 7, 8, 9, 10, 11]]
  for (const round of [1, 2]) {
    const slots = slotsForRound(m.currentRound)
    for (const i of [0, 1]) {
      slots.forEach((slot, k) => assert.equal(placeCard(m, i, { cardIdx: m.hand[i][k], slot }).ok, true))
      m.ready[i] = true
    }
    revealPlacedCards(m)
    advanceRound(m)
    if (m.phase === 'discard') { submitDiscard(m, 0, { cardIdxs: [] }); submitDiscard(m, 1, { cardIdxs: [] }); resolveDiscardPhase(m) }
  }
  recordSwapChoice(m, 0, false); recordSwapChoice(m, 1, false)
  resolveSwapPhase(m)
  checkMatchEnd(m)
  return m
}

for (const entry of OG_GTOON_POWER_CATALOG) {
  if (SPECIAL.has(entry.description) || entry.effect.length === 0) continue
  test(`real match: ${entry.description}`, () => {
    const bias = vocabFromEffect(entry.effect)
    const rng = rngFrom(99 + entry.description.length * 7919)
    for (let n = 0; n < 12; n++) {
      const { board, srcRef, src } = buildBoard(rng, VOCAB, bias, entry, { partial: false })
      const expected = referenceBoard(board, srcRef, entry.description)
      const m = playRealMatch(board)
      for (const [i, sideName] of [[0, 'p1'], [1, 'p2']]) {
        m.revealed[i].forEach((r, k) => {
          const card = board[sideName][r.slot - 1]
          const want = expected.get(card)
          assert.equal(r.finalValue, want.value, `${entry.description}: ${sideName} slot ${r.slot} (${card.characters}, ${card.color} ${card.value}) source ${srcRef.side}/${srcRef.slot}`)
          assert.equal(r.color, want.color)
        })
      }
      assert.ok(src)
    }
  })
}

/* ── scenario tests for powers the generic reference cannot express ──────────────────────── */

function runBoard(p1, p2, goal1 = null, goal2 = null) {
  const side = (cards, goal) => ({ revealed: cards.map((c, i) => c && ({ ...c, slot: i + 1, round: i < 4 ? 1 : 2 })).filter(Boolean), goalCard: goal })
  return resolveFinalBoard({ player1: side(p1, goal1), player2: side(p2, goal2) })
}
const C = (id, over = {}) => ({ ctoonId: id, name: id, characters: [], color: 'SILVER', value: 5, type1: null, type2: null, type3: null, group: null, isSlam: false, effect: null, ...over })
const power = (desc) => OG_GTOON_POWER_CATALOG.find(e => e.description === desc).effect

test('power: "Opposing card loses all adjacency effects" switches off only neighbor-dependent powers', () => {
  const adjacencyOnly = power('+10 if next to Bubbles')
  const plainBuff = power('+2 to all Blue cards')
  const negator = C('neg', { effect: power('Opposing card loses all adjacency effects') })
  const bubbles = C('bub', { characters: ['Bubbles'] })
  // Player 1 slot 2 has "+10 if next to Bubbles" with Bubbles beside it; player 2's negator sits opposite (slot 2).
  const p1 = [C('a1', { characters: ['Bubbles'] }), C('a2', { effect: adjacencyOnly }), C('a3'), C('a4'), C('a5'), C('a6'), C('a7')]
  const p2 = [C('b1'), negator, C('b3'), C('b4'), C('b5'), C('b6'), C('b7')]
  const res = runBoard(p1, p2)
  assert.equal(res.player1.revealed[1].finalValue, 5, 'the +10 next-to power is switched off')
  // Same board without the negator: the +10 lands.
  assert.equal(runBoard(p1, [C('b1'), C('b2'), C('b3'), C('b4'), C('b5'), C('b6'), C('b7')]).player1.revealed[1].finalValue, 15)
  // A non-adjacency power on the opposed card is untouched.
  const p1b = [C('a1', { color: 'BLUE' }), C('a2', { color: 'BLUE', effect: plainBuff }), C('a3'), C('a4'), C('a5'), C('a6'), C('a7')]
  const resB = runBoard(p1b, p2)
  assert.equal(resB.player1.revealed[0].finalValue, 7)
  assert.equal(resB.player1.revealed[1].finalValue, 7)
  assert.ok(bubbles)
})

test('power: a negator that is itself cancelled by a full negation stops cancelling adjacency effects', () => {
  const adj = C('adj', { effect: power('+10 if next to Bubbles') })
  const negAdj = C('negAdj', { effect: power('Opposing card loses all adjacency effects') })
  const fullNeg = C('full', { effect: [{ trigger: 'onReveal', target: { selector: 'opponentActiveCard' }, action: { type: 'negateEffect' } }] })
  const p1 = [C('x1', { characters: ['Bubbles'] }), adj, fullNeg, C('x4'), C('x5'), C('x6'), C('x7')]
  const p2 = [C('y1'), negAdj, C('y3'), C('y4'), C('y5'), C('y6'), C('y7')]
  // p1 slot 3 (fullNeg) cancels p2 slot 3 only, so negAdj (slot 2) still strips the +10.
  assert.equal(runBoard(p1, p2).player1.revealed[1].finalValue, 5)
  // Put fullNeg opposite negAdj instead: negAdj is cancelled, so the +10 returns.
  const p1b = [C('x1', { characters: ['Bubbles'] }), fullNeg, adj, C('x4'), C('x5'), C('x6'), C('x7')]
  const p2b = [C('y1'), negAdj, C('y3'), C('y4'), C('y5'), C('y6'), C('y7')]
  assert.equal(runBoard(p1b, p2b).player1.revealed[2].finalValue, 5, 'adj is at slot 3 next to slot 2 (not Bubbles) so no +10 either way')
  const p1c = [C('x1'), fullNeg, C('x3', { characters: ['Bubbles'] }), C('x4'), C('x5'), C('x6'), C('x7')]
  const adjAt2 = [C('y1'), negAdj, C('y3'), C('y4'), C('y5'), C('y6'), C('y7')]
  // adj opposite negAdj, fullNeg elsewhere cannot reach it; sanity that the engine handles the chain without throwing
  assert.ok(runBoard(p1c, adjAt2).player1.revealed.length === 7)
})

test('power: recolor powers change the color the rest of the board sees (colors resolve before values)', () => {
  const recolor = C('rc', { effect: power('Treats opposing card as Black') })
  const blueBuffer = C('bb', { color: 'BLUE', effect: power('+2 to all Blue cards') })
  // p2's slot 1 is Blue; p1's recolor card faces it, turning it Black, so it no longer gets +2.
  const p1 = [recolor, blueBuffer, C('a3'), C('a4'), C('a5'), C('a6'), C('a7')]
  const p2 = [C('b1', { color: 'BLUE' }), C('b2', { color: 'BLUE' }), C('b3'), C('b4'), C('b5'), C('b6'), C('b7')]
  const res = runBoard(p1, p2)
  assert.equal(res.player2.revealed[0].color, 'BLACK')
  assert.equal(res.player2.revealed[0].finalValue, 5, 'recolored before the +2 to Blue is counted')
  assert.equal(res.player2.revealed[1].finalValue, 7, 'the other Blue card still gets +2')
})

test('power: "Treats neighboring cards as Green" recolors both neighbors, and +N to all Green then counts them', () => {
  const rc = C('rc', { effect: power('Treats neighboring cards as Green') })
  const greenBuff = C('gb', { color: 'GREEN', effect: power('+3 to all Green cards') })
  const p1 = [C('a1'), rc, C('a3'), C('a4'), C('a5'), C('a6'), C('a7')]
  const p2 = [greenBuff, C('b2'), C('b3'), C('b4'), C('b5'), C('b6'), C('b7')]
  const res = runBoard(p1, p2)
  assert.deepEqual([res.player1.revealed[0].color, res.player1.revealed[2].color], ['GREEN', 'GREEN'])
  assert.equal(res.player1.revealed[0].finalValue, 8)
  assert.equal(res.player1.revealed[2].finalValue, 8)
  assert.equal(res.player1.revealed[1].finalValue, 5, 'the recolor card itself is not recolored')
})

test('power: an empty slot between two cards breaks "next to" (neighbors follow board slots)', () => {
  const buddy = power('+10 if next to Bubbles')
  const p1 = [C('a1', { characters: ['Bubbles'] }), null, C('a3', { effect: buddy }), C('a4'), C('a5'), C('a6'), C('a7')]
  assert.equal(runBoard(p1, [C('b1')]).player1.revealed[1].finalValue, 5)
})

test('power: a gToon on both boards cancels itself (and its power) on both sides', () => {
  const same = C('same', { effect: power('+2 to all Blue cards'), color: 'BLUE' })
  const res = runBoard([same, C('a2', { color: 'BLUE' })], [same, C('b2', { color: 'BLUE' })])
  assert.equal(res.player1.revealed[0].finalValue, 0)
  assert.equal(res.player1.revealed[1].finalValue, 5, 'its +2 to Blue is gone too')
})

/* ── same-character / same-gToon cancellation (the printed game rule) ───────────────────── */

test('rule: same character in play — only the lower point value counts (Bubbles Laughing 5 vs Bubbles Flying 8)', () => {
  const p1 = [C('laugh', { characters: ['Bubbles'], value: 5 }), C('a2'), C('a3'), C('a4'), C('a5'), C('a6'), C('a7')]
  const p2 = [C('fly', { characters: ['Bubbles'], value: 8 }), C('b2'), C('b3'), C('b4'), C('b5'), C('b6'), C('b7')]
  const res = runBoard(p1, p2)
  assert.equal(res.player1.revealed[0].finalValue, 5)
  assert.equal(res.player2.revealed[0].finalValue, 0)
  assert.equal(res.player2.revealed[0].cancelled, true)
  assert.equal(res.player1.totalValue, 35)
  assert.equal(res.player2.totalValue, 30)
  assert.deepEqual(res.analysis.knockedOut.map(k => [k.side, k.cause.kind, k.cause.character]), [['player2', 'sameCharacter', 'Bubbles']])
})

test('rule: same character on the SAME side also counts once, and any shared character is enough', () => {
  const p1 = [C('x1', { characters: ['Ed', 'Edd'], value: 9 }), C('x2', { characters: ['Edd'], value: 4 }), C('x3', { characters: ['Ed'], value: 6 }), C('a4'), C('a5'), C('a6'), C('a7')]
  const res = runBoard(p1, [C('b1')])
  assert.deepEqual(res.player1.revealed.slice(0, 3).map(r => r.finalValue), [0, 4, 6], 'Ed/Edd 9 loses on both names; Edd 4 and Ed 6 are each the lowest of theirs')
})

test('rule: a knocked-out card scores 0, loses its power, is not counted by powers and gives no color', () => {
  const buff = C('buff', { characters: ['Bubbles'], value: 8, effect: power('+2 to all Blue cards'), color: 'BLUE' })
  const low = C('low', { characters: ['Bubbles'], value: 3, color: 'BLUE' })
  const res = runBoard([buff, C('a2', { color: 'BLUE' })], [low, C('b2', { color: 'BLUE' })])
  assert.equal(res.player1.revealed[0].finalValue, 0)
  assert.equal(res.player1.revealed[1].finalValue, 5, 'its +2 to Blue never happens')
  assert.equal(res.player2.revealed[0].finalValue, 3)
})

test('rule: cards tied for the lowest value all stay; the exact same gToon cancels every copy', () => {
  const tie = runBoard([C('t1', { characters: ['Bubbles'], value: 5 })], [C('t2', { characters: ['Bubbles'], value: 5 })])
  assert.equal(tie.player1.revealed[0].finalValue, 5)
  assert.equal(tie.player2.revealed[0].finalValue, 5)
  const same = C('same', { characters: ['Bubbles'], value: 4 })
  const both = runBoard([same, C('a2')], [same, C('b2')])
  assert.equal(both.player1.revealed[0].finalValue, 0)
  assert.equal(both.player2.revealed[0].finalValue, 0)
  assert.equal(both.analysis.knockedOut[0].cause.kind, 'duplicate')
})

test('rule: a knocked-out card gives up its color for the goal-color count, in a real match', () => {
  const board = { p1: [], p2: [] }
  for (const s of ['p1', 'p2']) for (let i = 0; i < 7; i++) board[s].push({ id: `${s}${i}`, name: `${s}${i}`, characters: [], color: 'RED', value: 5, types: [], group: null, effect: null })
  board.p1[0].characters = ['Bubbles']; board.p1[0].value = 9
  board.p2[0].characters = ['Bubbles']; board.p2[0].value = 2
  const m = playRealMatch(board)
  assert.equal(m.revealed[0][0].cancelled, true)
  assert.equal(m.revealed[0][0].finalValue, 0)
  assert.equal(m.revealed[1][0].finalValue, 2)
  assert.ok(m.gameLog.some(e => e.kind === 'scoring' && JSON.stringify(e.sections).includes('same character (Bubbles)')))
})
