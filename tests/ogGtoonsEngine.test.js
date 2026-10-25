import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveGoalColor, validateDeckPositions, canSwap, applySwap, SWAP_COST, determineWinner,
  slotsForRound, isSuddenDeathRound, dealOpeningHand, discardAndDeal, swapForRandomUndealt,
  shuffled, HAND_SIZE, REGULATION_SLOTS, assignRandomGoals
} from '../server/utils/ogGtoonEngine.js'
import {
  resolveRoundEffects, resolveFinalBoard, isValidEffect, validateEffectSchema
} from '../server/utils/ogGtoonEffects.js'
import { OG_GTOON_POWER_CATALOG, lookupPower } from '../server/utils/ogGtoonPowerCatalog.js'

test('deriveGoalColor reads position 11', () => {
  const deck = new Array(12).fill(null).map((_, i) => ({ color: 'RED' }))
  deck[11] = { color: 'BLUE' }
  assert.equal(deriveGoalColor(deck), 'BLUE')
})

test('validateDeckPositions requires exactly 12 unique positions 0-11', () => {
  const good = Array.from({ length: 12 }, (_, i) => ({ position: i }))
  assert.equal(validateDeckPositions(good), true)
  assert.equal(validateDeckPositions(good.slice(0, 11)), false)
  const dup = Array.from({ length: 12 }, (_, i) => ({ position: i === 11 ? 0 : i }))
  assert.equal(validateDeckPositions(dup), false)
  assert.equal(validateDeckPositions(null), false)
})

test('canSwap blocks reuse, post-reveal, and insufficient balance', () => {
  assert.equal(canSwap({ swapUsed: true, pointBalance: 100, roundRevealed: false }).ok, false)
  assert.equal(canSwap({ swapUsed: false, pointBalance: 100, roundRevealed: true }).ok, false)
  assert.equal(canSwap({ swapUsed: false, pointBalance: 5, roundRevealed: false }).ok, false)
  assert.equal(canSwap({ swapUsed: false, pointBalance: SWAP_COST, roundRevealed: false }).ok, true)
})

test('applySwap swaps index 0 with the chosen index, never mutating the input', () => {
  const deck = [10, 11, 12, 13]
  const next = applySwap(deck, 2)
  assert.deepEqual(next, [12, 11, 10, 13])
  assert.deepEqual(deck, [10, 11, 12, 13]) // unchanged
  assert.throws(() => applySwap(deck, 0))
  assert.throws(() => applySwap(deck, 4))
})

function revealed(entries) {
  // entries: [[finalValue, color], ...]
  return entries.map(([finalValue, color]) => ({ finalValue, color }))
}

test('determineWinner: both goal colors neutral -> higher total value wins', () => {
  const out = determineWinner({
    player1GoalColor: 'BLACK',
    player2GoalColor: 'SILVER',
    player1Revealed: revealed([[10, 'RED'], [5, 'BLUE']]),
    player2Revealed: revealed([[8, 'RED'], [4, 'BLUE']])
  })
  assert.equal(out.winner, 'player1')
  assert.equal(out.reason, 'total_value')
})

test('determineWinner: exactly one non-neutral -> color-count leader gets +15 before comparing', () => {
  // player2 has fewer total value but more RED cards (their non-neutral goal color), so the
  // +15 bonus should flip the outcome in their favor.
  const out = determineWinner({
    player1GoalColor: 'BLACK', // neutral
    player2GoalColor: 'RED',   // non-neutral
    player1Revealed: revealed([[10, 'BLUE'], [5, 'BLUE']]), // total 15, 0 RED
    player2Revealed: revealed([[6, 'RED'], [5, 'RED']])      // total 11, 2 RED -> +15 = 26
  })
  assert.equal(out.winner, 'player2')
  assert.equal(out.bonus.color, 'RED')
  assert.equal(out.player2Score, 26)
})

test('determineWinner: both non-neutral, equal combined count -> falls back to total value', () => {
  const out = determineWinner({
    player1GoalColor: 'RED',
    player2GoalColor: 'BLUE',
    player1Revealed: revealed([[1, 'RED'], [1, 'RED'], [1, 'BLUE']]), // 2 RED, 1 BLUE
    player2Revealed: revealed([[1, 'RED'], [1, 'BLUE'], [1, 'BLUE']]) // 1 RED, 2 BLUE
  })
  // Combined RED+BLUE is 3 vs 3 -- no outright win, so it falls back to total value (a tie here: 3 vs 3).
  assert.equal(out.winner, null)
  assert.equal(out.reason, 'tie')
})

test('determineWinner: both non-neutral, equal combined count, higher points wins the tiebreak', () => {
  const out = determineWinner({
    player1GoalColor: 'RED',
    player2GoalColor: 'BLUE',
    player1Revealed: revealed([[1, 'RED'], [1, 'RED'], [1, 'BLUE']]), // 3 combined, total 3
    player2Revealed: revealed([[5, 'RED'], [1, 'BLUE'], [1, 'BLUE']]) // 3 combined, total 7
  })
  assert.equal(out.winner, 'player2')
  assert.equal(out.reason, 'total_value')
})

test('determineWinner: both non-neutral, one player has the most of both colors combined -> outright win regardless of total value', () => {
  const out = determineWinner({
    player1GoalColor: 'RED',
    player2GoalColor: 'BLUE',
    player1Revealed: revealed([[1, 'RED'], [1, 'RED'], [1, 'BLUE'], [1, 'BLUE']]), // 2 RED, 2 BLUE, total 4
    player2Revealed: revealed([[100, 'GREEN']]) // 0 RED, 0 BLUE, total 100
  })
  assert.equal(out.winner, 'player1')
  assert.equal(out.reason, 'both_colors')
})

test('isValidEffect / validateEffectSchema reject malformed effects', () => {
  assert.equal(isValidEffect({ trigger: 'onReveal', target: { selector: 'self' }, action: { type: 'modifyValue', operation: 'multiply', amount: 2 } }), true)
  assert.equal(isValidEffect({ trigger: 'bogus', target: { selector: 'self' }, action: { type: 'negateEffect' } }), false)
  assert.equal(isValidEffect({ trigger: 'onReveal', target: { selector: 'cardByCharacter' }, action: { type: 'negateEffect' } }), false) // missing character
  assert.equal(validateEffectSchema(null).ok, true)
  assert.equal(validateEffectSchema([{ trigger: 'onReveal', target: { selector: 'self' }, action: { type: 'setColor', color: 'RED' } }]).ok, true)
  assert.equal(validateEffectSchema([{ trigger: 'onReveal' }]).ok, false)
})

test('resolveRoundEffects: modifyValue-multiply fires when the condition character is in play', () => {
  const slycat = {
    ctoonId: 'slycat', name: 'Slycat', characters: ['Slycat'], color: 'BLUE', value: 3,
    effect: [{ trigger: 'onReveal', target: { selector: 'self' }, condition: { type: 'characterInPlay', character: 'Bramble Fox', side: 'either' }, action: { type: 'modifyValue', operation: 'multiply', amount: 2 } }]
  }
  const brambleFox = { ctoonId: 'bramble', name: 'Bramble Fox', characters: ['Bramble Fox'], color: 'RED', value: 6 }
  const out = resolveRoundEffects({
    player1: { card: slycat, goalCard: null, priorRevealed: [] },
    player2: { card: brambleFox, goalCard: null, priorRevealed: [] }
  })
  assert.equal(out.player1.finalValue, 6) // 3 * 2
  assert.equal(out.effectsResolved.length, 1)
  assert.equal(out.effectsResolved[0].action, 'modifyValue')
})

test('resolveRoundEffects: modifyValue-add fires with condition met', () => {
  const circuitWisp = {
    ctoonId: 'cw', name: 'Circuit Wisp', characters: ['Circuit Wisp'], color: 'YELLOW', value: 4,
    effect: [{ trigger: 'onReveal', target: { selector: 'self' }, condition: { type: 'characterInPlay', character: 'TOM Unit', side: 'either' }, action: { type: 'modifyValue', operation: 'add', amount: 5 } }]
  }
  const tom = { ctoonId: 'tom', name: 'TOM Unit', characters: ['TOM Unit'], color: 'YELLOW', value: 5 }
  const out = resolveRoundEffects({
    player1: { card: circuitWisp, goalCard: null, priorRevealed: [] },
    player2: { card: tom, goalCard: null, priorRevealed: [] }
  })
  assert.equal(out.player1.finalValue, 9) // 4 + 5
})

test('resolveRoundEffects: static goal-card aura (setColor via cardByCharacter) applies every round', () => {
  const moonshade = {
    ctoonId: 'moon', name: 'Moonshade', characters: ['Moonshade'], color: 'BLACK', value: 5,
    effect: [{ trigger: 'static', target: { selector: 'cardByCharacter', character: 'Glimmertail' }, condition: { type: 'characterInPlay', character: 'Slycat', side: 'either' }, action: { type: 'modifyValue', operation: 'multiply', amount: 2 } }]
  }
  const glimmertail = { ctoonId: 'glim', name: 'Glimmertail', characters: ['Glimmertail'], color: 'GREEN', value: 7 }
  const slycat = { ctoonId: 'sly', name: 'Slycat', characters: ['Slycat'], color: 'BLUE', value: 3 }
  const out = resolveRoundEffects({
    player1: { card: glimmertail, goalCard: moonshade, priorRevealed: [] },
    player2: { card: slycat, goalCard: null, priorRevealed: [] }
  })
  assert.equal(out.player1.finalValue, 14) // 7 * 2, aura fired because Slycat is in play this round
})

test('resolveRoundEffects: negateEffect suppresses the target card\'s own effect', () => {
  const grimjaw = {
    ctoonId: 'grim', name: 'Grimjaw', characters: ['Grimjaw'], color: 'PURPLE', value: 6,
    effect: [{ trigger: 'onReveal', target: { selector: 'opponentActiveCard' }, action: { type: 'negateEffect' } }]
  }
  const slycat = {
    ctoonId: 'sly', name: 'Slycat', characters: ['Slycat'], color: 'BLUE', value: 3,
    effect: [{ trigger: 'onReveal', target: { selector: 'self' }, condition: { type: 'characterInPlay', character: 'Bramble Fox', side: 'either' }, action: { type: 'modifyValue', operation: 'multiply', amount: 2 } }]
  }
  const brambleFox = { ctoonId: 'bramble', name: 'Bramble Fox', characters: ['Bramble Fox'], color: 'RED', value: 6 }
  // Without Grimjaw, Slycat would double to 6 because Bramble Fox conditions are irrelevant here
  // (BrambleFox isn't in this round) -- so instead pair Slycat directly against Bramble Fox and
  // confirm Grimjaw (as a third voice) suppresses Slycat's multiply.
  const out = resolveRoundEffects({
    player1: { card: slycat, goalCard: null, priorRevealed: [] },
    player2: { card: brambleFox, goalCard: null, priorRevealed: [] }
  })
  assert.equal(out.player1.finalValue, 6) // sanity: without negation, Slycat doubles (3*2)

  // Now swap Bramble Fox out for Grimjaw as player2's active card: Grimjaw negates Slycat's
  // effect outright (unconditional), so Slycat should stay at its base value.
  const out2 = resolveRoundEffects({
    player1: { card: slycat, goalCard: null, priorRevealed: [] },
    player2: { card: grimjaw, goalCard: null, priorRevealed: [] }
  })
  assert.equal(out2.player1.finalValue, 3) // negated -- Slycat's own multiply never fires
  assert.ok(out2.effectsResolved.some(e => e.action === 'negateEffect'))
})

test('a malformed effect on a card does not throw resolveRoundEffects (normalizeEffects drops it)', () => {
  const bad = { ctoonId: 'bad', name: 'Bad Card', characters: [], color: 'RED', value: 5, effect: [{ trigger: 'onReveal' }] }
  const other = { ctoonId: 'ok', name: 'OK Card', characters: [], color: 'BLUE', value: 4 }
  assert.doesNotThrow(() => {
    const out = resolveRoundEffects({
      player1: { card: bad, goalCard: null, priorRevealed: [] },
      player2: { card: other, goalCard: null, priorRevealed: [] }
    })
    assert.equal(out.player1.finalValue, 5)
  })
})

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * Extended schema + resolveFinalBoard coverage (added alongside gtoonType1/2/3, gtoonGroup and
 * the historical power catalog — see server/utils/ogGtoonEffects.js's module header).
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

test('isValidEffect accepts every new condition type, target selector, and perMatch action', () => {
  assert.equal(isValidEffect({ trigger: 'onReveal', target: { selector: 'self' }, condition: { type: 'typeInPlay', cardType: 'PROP', side: 'either' }, action: { type: 'modifyValue', operation: 'add', amount: 1 } }), true)
  assert.equal(isValidEffect({ trigger: 'onReveal', target: { selector: 'self' }, condition: { type: 'groupInPlay', group: 'JUSTICE_LEAGUE', side: 'own' }, action: { type: 'modifyValue', operation: 'add', amount: 1 } }), true)
  assert.equal(isValidEffect({ trigger: 'onReveal', target: { selector: 'self' }, condition: { type: 'colorInPlay', color: 'RED', side: 'opponent' }, action: { type: 'modifyValue', operation: 'add', amount: 1 } }), true)
  assert.equal(isValidEffect({ trigger: 'onReveal', target: { selector: 'self' }, condition: { type: 'valueInPlay', value: 8, side: 'either' }, action: { type: 'modifyValue', operation: 'add', amount: 1 } }), true)
  assert.equal(isValidEffect({ trigger: 'onReveal', target: { selector: 'opponentActiveCard' }, condition: { type: 'targetLacksType', cardType: 'VILLAIN' }, action: { type: 'modifyValue', operation: 'add', amount: -5 } }), true)
  assert.equal(isValidEffect({ trigger: 'onReveal', target: { selector: 'neighborOwn', positions: ['prev', 'next'], filter: { by: 'color', value: 'RED' } }, action: { type: 'modifyValue', operation: 'add', amount: 2 } }), true)
  assert.equal(isValidEffect({ trigger: 'onReveal', target: { selector: 'allMatching', scope: 'both', filters: [{ by: 'type', value: 'HERO' }], excludeSelf: true }, action: { type: 'modifyValue', operation: 'add', amount: 2 } }), true)
  assert.equal(isValidEffect({ trigger: 'onReveal', target: { selector: 'self' }, action: { type: 'modifyValue', operation: 'add', amount: 2, perMatch: { by: 'type', value: 'PROP', scope: 'both' } } }), true)
  // rejections
  assert.equal(isValidEffect({ trigger: 'onReveal', target: { selector: 'self' }, condition: { type: 'typeInPlay', cardType: 'NOT_A_TYPE' }, action: { type: 'modifyValue', operation: 'add', amount: 1 } }), false)
  assert.equal(isValidEffect({ trigger: 'onReveal', target: { selector: 'allMatching', scope: 'bogus' }, action: { type: 'modifyValue', operation: 'add', amount: 1 } }), false)
  assert.equal(isValidEffect({ trigger: 'onReveal', target: { selector: 'self' }, action: { type: 'modifyValue', operation: 'add', amount: 2, perMatch: { by: 'type', value: 'PROP', scope: 'bogus' } } }), false)
})

function revealedCard(ctoonId, name, { color = 'RED', value = 1, type1 = null, type2 = null, type3 = null, group = null, characters = [name], effect = null } = {}) {
  return { ctoonId, name, characters, color, value, type1, type2, type3, group, effect, round: null }
}

test('resolveFinalBoard: perMatch aggregation counts board-wide matches ("+2 for each Prop in play")', () => {
  const propBuffer = revealedCard('p1', 'Prop Buffer', {
    value: 2, type1: 'PROP',
    effect: [{ trigger: 'onReveal', target: { selector: 'self' }, action: { type: 'modifyValue', operation: 'add', amount: 2, perMatch: { by: 'type', value: 'PROP', scope: 'both' } } }]
  })
  const p1b = revealedCard('p1b', 'Another Prop', { value: 1, type1: 'PROP' })
  const p2a = revealedCard('p2a', 'Opponent Prop', { value: 1, type1: 'PROP' })
  const out = resolveFinalBoard({
    player1: { revealed: [propBuffer, p1b], goalCard: null },
    player2: { revealed: [p2a], goalCard: null }
  })
  // 3 total Props in play (propBuffer itself + p1b + p2a) -> +2*3 = +6 -> 2 + 6 = 8
  assert.equal(out.player1.revealed[0].finalValue, 8)
})

test('resolveFinalBoard: allMatching applies a flat buff to every matching card on the board (blanket color buff)', () => {
  const buffer = revealedCard('b1', 'Blue Buffer', {
    color: 'BLUE', value: 1,
    effect: [{ trigger: 'onReveal', target: { selector: 'allMatching', scope: 'both', filters: [{ by: 'color', value: 'BLUE' }] }, action: { type: 'modifyValue', operation: 'add', amount: 2 } }]
  })
  const ownBlue = revealedCard('b2', 'Own Blue', { color: 'BLUE', value: 3 })
  const oppBlue = revealedCard('b3', 'Opp Blue', { color: 'BLUE', value: 4 })
  const oppRed = revealedCard('b4', 'Opp Red', { color: 'RED', value: 5 })
  const out = resolveFinalBoard({
    player1: { revealed: [buffer, ownBlue], goalCard: null },
    player2: { revealed: [oppBlue, oppRed], goalCard: null }
  })
  assert.equal(out.player1.revealed[0].finalValue, 3) // buffer itself is Blue too: 1 + 2
  assert.equal(out.player1.revealed[1].finalValue, 5) // ownBlue: 3 + 2
  assert.equal(out.player2.revealed[0].finalValue, 6) // oppBlue: 4 + 2
  assert.equal(out.player2.revealed[1].finalValue, 5) // oppRed unaffected
})

test('resolveFinalBoard: neighborOwn applies a flat buff to the source card\'s own adjacent revealed cards', () => {
  const before = revealedCard('n1', 'Before', { value: 1, type1: 'ANIMAL' })
  const buffer = revealedCard('n2', 'Neighbor Buffer', {
    value: 5,
    effect: [{ trigger: 'onReveal', target: { selector: 'neighborOwn', filter: { by: 'type', value: 'ANIMAL' } }, action: { type: 'modifyValue', operation: 'add', amount: 5 } }]
  })
  const after = revealedCard('n3', 'After', { value: 2, type1: 'ANIMAL' })
  const oppCard = revealedCard('n4', 'Opp Filler', { value: 0 })
  const out = resolveFinalBoard({
    player1: { revealed: [before, buffer, after], goalCard: null },
    player2: { revealed: [oppCard], goalCard: null }
  })
  assert.equal(out.player1.revealed[0].finalValue, 6) // before: 1 + 5
  assert.equal(out.player1.revealed[1].finalValue, 5) // buffer itself untouched by its own neighborOwn target
  assert.equal(out.player1.revealed[2].finalValue, 7) // after: 2 + 5
})

test('resolveFinalBoard: targetLacksType on opponentActiveCard ("-5 to opposing card if not a Villain")', () => {
  const attacker = revealedCard('a1', 'Attacker', {
    value: 3,
    effect: [{ trigger: 'onReveal', target: { selector: 'opponentActiveCard' }, condition: { type: 'targetLacksType', cardType: 'VILLAIN' }, action: { type: 'modifyValue', operation: 'add', amount: -5 } }]
  })
  const nonVillain = revealedCard('t1', 'Non-Villain', { value: 10, type1: 'HERO' })
  const outHit = resolveFinalBoard({
    player1: { revealed: [attacker], goalCard: null },
    player2: { revealed: [nonVillain], goalCard: null }
  })
  assert.equal(outHit.player2.revealed[0].finalValue, 5) // 10 - 5

  const villain = revealedCard('t2', 'A Villain', { value: 10, type1: 'VILLAIN' })
  const outSpared = resolveFinalBoard({
    player1: { revealed: [attacker], goalCard: null },
    player2: { revealed: [villain], goalCard: null }
  })
  assert.equal(outSpared.player2.revealed[0].finalValue, 10) // unaffected -- target has the type
})

test('resolveFinalBoard: allOwnRevealed now covers the WHOLE match history (upgraded from the v1 per-round simplification)', () => {
  const auraCard = revealedCard('h1', 'History Buffer', {
    value: 1,
    effect: [{ trigger: 'onReveal', target: { selector: 'allOwnRevealed' }, action: { type: 'modifyValue', operation: 'add', amount: 1 } }]
  })
  const earlier = revealedCard('h0', 'Earlier Card', { value: 2 })
  const later = revealedCard('h2', 'Later Card', { value: 3 })
  const out = resolveFinalBoard({
    player1: { revealed: [earlier, auraCard, later], goalCard: null },
    player2: { revealed: [revealedCard('opp', 'Opp Filler', { value: 0 })], goalCard: null }
  })
  assert.equal(out.player1.revealed[0].finalValue, 3) // earlier: 2 + 1
  assert.equal(out.player1.revealed[1].finalValue, 2) // auraCard itself: 1 + 1
  assert.equal(out.player1.revealed[2].finalValue, 4) // later: 3 + 1
})

test('resolveFinalBoard: negation suppresses a card\'s own effects for the whole pass, same as resolveRoundEffects', () => {
  const grimjaw = revealedCard('g1', 'Grimjaw', {
    value: 6,
    effect: [{ trigger: 'onReveal', target: { selector: 'opponentActiveCard' }, action: { type: 'negateEffect' } }]
  })
  const slycat = revealedCard('s1', 'Slycat', {
    value: 3,
    effect: [{ trigger: 'onReveal', target: { selector: 'self' }, condition: { type: 'characterInPlay', character: 'Bramble Fox', side: 'either' }, action: { type: 'modifyValue', operation: 'multiply', amount: 2 } }],
    characters: ['Slycat']
  })
  const brambleFox = revealedCard('bf1', 'Bramble Fox', { value: 1, characters: ['Bramble Fox'] })
  const out = resolveFinalBoard({
    player1: { revealed: [slycat], goalCard: null },
    player2: { revealed: [grimjaw, brambleFox], goalCard: null }
  })
  // Grimjaw is at round 0, same as Slycat's round -> opponentActiveCard hits Slycat and negates it.
  assert.equal(out.player1.revealed[0].finalValue, 3) // un-doubled
})

test('resolveFinalBoard feeds determineWinner directly (its revealed entries already have finalValue/color)', () => {
  const p1card = revealedCard('w1', 'P1 Card', { value: 5, color: 'RED' })
  const p2card = revealedCard('w2', 'P2 Card', { value: 3, color: 'BLUE' })
  const final = resolveFinalBoard({
    player1: { revealed: [p1card], goalCard: null },
    player2: { revealed: [p2card], goalCard: null }
  })
  const outcome = determineWinner({
    player1GoalColor: 'BLACK', player2GoalColor: 'SILVER',
    player1Revealed: final.player1.revealed, player2Revealed: final.player2.revealed
  })
  assert.equal(outcome.winner, 'player1')
})

test('ogGtoonPowerCatalog: every one of the 198 historical powers has a valid, schema-conformant catalog entry', () => {
  assert.equal(OG_GTOON_POWER_CATALOG.length, 198)
  for (const entry of OG_GTOON_POWER_CATALOG) {
    assert.equal(typeof entry.description, 'string')
    assert.ok(Array.isArray(entry.effect))
    for (const eff of entry.effect) assert.equal(isValidEffect(eff), true, `invalid effect for "${entry.description}"`)
  }
  assert.deepEqual(lookupPower('No Power'), { description: 'No Power', effect: [], note: null })
  assert.deepEqual(lookupPower('No power'), { description: 'No power', effect: [], note: null })
  assert.equal(lookupPower('not a real power'), null)
})


/* ── Hand & slot rules ────────────────────────────────────────────────────────────────────── */

function seededRng(seed = 1) {
  let x = seed
  return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646 }
}

test('slotsForRound: 4 then 3 over slots 1-7, round 3 places nothing, then one extra slot per sudden-death round', () => {
  assert.deepEqual(slotsForRound(1), [1, 2, 3, 4])
  assert.deepEqual(slotsForRound(2), [5, 6, 7])
  assert.deepEqual(slotsForRound(3), [])
  assert.deepEqual(slotsForRound(4), [8])
  assert.deepEqual(slotsForRound(6), [10])
  assert.equal(REGULATION_SLOTS, 7)
  assert.equal(isSuddenDeathRound(3), false)
  assert.equal(isSuddenDeathRound(4), true)
})

test('shuffled returns a permutation without mutating the input', () => {
  const input = [...Array(12).keys()]
  const out = shuffled(input, seededRng(3))
  assert.deepEqual(input, [...Array(12).keys()])
  assert.deepEqual([...out].sort((a, b) => a - b), input)
  assert.notDeepEqual(out, input)
})

test('dealOpeningHand deals 6 and leaves 6 undealt, different seeds deal differently', () => {
  const a = dealOpeningHand(seededRng(1))
  const b = dealOpeningHand(seededRng(2))
  assert.equal(a.hand.length, HAND_SIZE)
  assert.equal(a.undealt.length, 12 - HAND_SIZE)
  assert.deepEqual([...a.hand, ...a.undealt].sort((x, y) => x - y), [...Array(12).keys()])
  assert.notDeepEqual(a.hand, b.hand)
})

test('discardAndDeal: refills to 6 — 4 + n drawn after playing 4 and discarding n', () => {
  for (const n of [0, 1, 2]) {
    const hand = [10, 11]
    const undealt = [0, 1, 2, 3, 4, 5]
    const res = discardAndDeal(hand, undealt, hand.slice(0, n))
    assert.equal(res.hand.length, 6)
    assert.equal(res.drawn.length, 4 + n)
    assert.equal(res.undealt.length, 2 - n)
    assert.equal(res.discarded.length, n)
  }
})

test('discardAndDeal: stops at the undealt count, and rejects cards not in hand or repeats', () => {
  const res = discardAndDeal([10, 11], [0], [])
  assert.equal(res.hand.length, 3)
  assert.throws(() => discardAndDeal([10, 11], [0], [5]))
  assert.throws(() => discardAndDeal([10, 11], [0], [10, 10]))
})

test('swapForRandomUndealt: the swapped card returns to the undealt pile, the drawn one enters the hand', () => {
  const hand = [1, 2, 3]
  const undealt = [7, 8, 9]
  const res = swapForRandomUndealt(hand, undealt, 2, seededRng(5))
  assert.equal(res.hand.includes(2), false)
  assert.equal(undealt.includes(res.drawn), true)
  assert.equal(res.hand.includes(res.drawn), true)
  assert.equal(res.undealt.includes(2), true)
  assert.deepEqual([...res.hand, ...res.undealt].sort((a, b) => a - b), [1, 2, 3, 7, 8, 9])
  assert.deepEqual(hand, [1, 2, 3])
  assert.throws(() => swapForRandomUndealt(hand, undealt, 99))
  assert.throws(() => swapForRandomUndealt(hand, [], 2))
})

test('resolveFinalBoard: neighbor adjacency follows the board layout (every touching slot), so a gap breaks the chain', () => {
  const buff = [{ trigger: 'onReveal', target: { selector: 'neighborOwn' }, action: { type: 'modifyValue', operation: 'add', amount: 3 } }]
  const at = (card, slot) => ({ ...card, slot })
  // Source in slot 2 touches slots 1, 3, 5 and 6 (slot 5 sits diagonally between 1 and 2); slot 4 and
  // slot 7 do not touch it, even though slot 4 is a numeric near-miss.
  const out = resolveFinalBoard({
    player1: {
      revealed: [
        at(revealedCard('src', 'Source', { value: 2, effect: buff }), 2),
        at(revealedCard('near', 'Near', { value: 2 }), 3),
        at(revealedCard('diag', 'Diagonal', { value: 2 }), 5),
        at(revealedCard('far', 'Far', { value: 2 }), 4),
        at(revealedCard('far7', 'Far Seven', { value: 2 }), 7)
      ],
      goalCard: null
    },
    player2: { revealed: [], goalCard: null }
  })
  const value = (id) => out.player1.revealed.find(r => r.ctoonId === id).finalValue
  assert.equal(value('near'), 5)
  assert.equal(value('diag'), 5)
  assert.equal(value('far'), 2)
  assert.equal(value('far7'), 2)
})


/* ── Dependency-aware final-board resolution: duplicates, cancel chains, recomputed colors ─── */

const at = (card, slot) => ({ ...card, slot })
const effect = (target, action, condition) => ({ trigger: 'onReveal', target, action, ...(condition ? { condition } : {}) })
const negate = (target) => effect(target, { type: 'negateEffect' })
const plus = (n, target = { selector: 'self' }, condition) => effect(target, { type: 'modifyValue', operation: 'add', amount: n }, condition)
const recolor = (color, target) => effect(target, { type: 'setColor', color })
const findCard = (out, side, id) => out[side].revealed.find(r => r.ctoonId === id)

test('resolveFinalBoard: the same gToon on both sides is knocked out on both sides (value 0, no powers)', () => {
  const dupA = at(revealedCard('dup', 'Twin', { value: 8, color: 'RED', effect: [plus(5)] }), 1)
  const dupB = at(revealedCard('dup', 'Twin', { value: 8, color: 'RED', effect: [plus(5)] }), 1)
  const mine = at(revealedCard('mine', 'Mine', { value: 3 }), 2)
  const theirs = at(revealedCard('theirs', 'Theirs', { value: 4 }), 2)
  const out = resolveFinalBoard({
    player1: { revealed: [dupA, mine], goalCard: null },
    player2: { revealed: [dupB, theirs], goalCard: null }
  })
  assert.equal(findCard(out, 'player1', 'dup').finalValue, 0)
  assert.equal(findCard(out, 'player2', 'dup').finalValue, 0)
  assert.equal(findCard(out, 'player1', 'dup').cancelled, true)
  assert.equal(findCard(out, 'player1', 'mine').finalValue, 3)
  assert.equal(out.player1.totalValue, 3)
  assert.equal(out.player2.totalValue, 4)
  assert.equal(out.effectsResolved.filter(e => e.action === 'duplicateCancelled').length, 2)
  assert.equal(out.effectsResolved.some(e => e.action === 'modifyValue'), false) // their +5s never fired
})

test('resolveFinalBoard: a knocked-out duplicate is invisible to counts, conditions and neighbors', () => {
  const dupA = at(revealedCard('dup', 'Twin Prop', { value: 1, type1: 'PROP' }), 1)
  const dupB = at(revealedCard('dup', 'Twin Prop', { value: 1, type1: 'PROP' }), 3)
  const counter = at(revealedCard('cnt', 'Counter', {
    value: 1,
    effect: [effect({ selector: 'self' }, { type: 'modifyValue', operation: 'add', amount: 2, perMatch: { by: 'type', value: 'PROP', scope: 'both' } })]
  }), 2)
  const out = resolveFinalBoard({
    player1: { revealed: [dupA, counter], goalCard: null },
    player2: { revealed: [dupB], goalCard: null }
  })
  assert.equal(findCard(out, 'player1', 'cnt').finalValue, 1) // zero Props in play -> no bonus
})

test('resolveFinalBoard: a cancel chain settles — A cancels B, so B no longer cancels C', () => {
  // Player1's cards are visited first, so B (player1) fires before A (player2) cancels it. A single
  // ordered pass would leave C cancelled by a card that is itself cancelled.
  const B = at(revealedCard('B', 'B', { value: 2, effect: [negate({ selector: 'cardByCharacter', character: 'Cee' })] }), 1)
  const A = at(revealedCard('A', 'A', { value: 2, effect: [negate({ selector: 'opponentActiveCard' })] }), 1)
  const C = at(revealedCard('C', 'Cee', { value: 4, characters: ['Cee'], effect: [plus(10)] }), 2)
  const out = resolveFinalBoard({
    player1: { revealed: [B], goalCard: null },
    player2: { revealed: [A, C], goalCard: null }
  })
  assert.equal(findCard(out, 'player2', 'C').finalValue, 14)  // C's own +10 fires again
  const negations = out.effectsResolved.filter(e => e.action === 'negateEffect')
  assert.deepEqual(negations.map(n => n.sourceCtoonId), ['A'])  // only the live negation is logged
})

test('resolveFinalBoard: a recolor (and everything keyed on it) is undone when its source is cancelled', () => {
  const caster = at(revealedCard('A', 'A', { value: 2, color: 'GREEN', effect: [recolor('RED', { selector: 'cardByCharacter', character: 'Bee' })] }), 1)
  const bee = at(revealedCard('B', 'Bee', { value: 3, color: 'BLUE', characters: ['Bee'] }), 2)
  const watcher = at(revealedCard('W', 'Watcher', {
    value: 1, color: 'YELLOW',
    effect: [plus(5, { selector: 'self' }, { type: 'colorInPlay', color: 'RED', side: 'either' })]
  }), 1)
  const open = resolveFinalBoard({
    player1: { revealed: [caster, bee], goalCard: null },
    player2: { revealed: [watcher], goalCard: null }
  })
  assert.equal(findCard(open, 'player1', 'B').color, 'RED')
  assert.equal(findCard(open, 'player2', 'W').finalValue, 6)

  const canceller = at(revealedCard('D', 'D', { value: 2, color: 'YELLOW', effect: [negate({ selector: 'opponentActiveCard' })] }), 1)
  const out = resolveFinalBoard({
    player1: { revealed: [caster, bee], goalCard: null },
    player2: { revealed: [canceller, at(watcher, 2)], goalCard: null }
  })
  assert.equal(findCard(out, 'player1', 'B').color, 'BLUE')   // back to its printed color
  assert.equal(findCard(out, 'player2', 'W').finalValue, 1)   // and nothing is RED anymore
})

test('resolveFinalBoard: two cards that cancel each other settle deterministically (player1, lower slot first)', () => {
  const x = at(revealedCard('X', 'X', { value: 3, effect: [negate({ selector: 'opponentActiveCard' }), plus(3)] }), 1)
  const y = at(revealedCard('Y', 'Y', { value: 3, effect: [negate({ selector: 'opponentActiveCard' }), plus(3)] }), 1)
  const out = resolveFinalBoard({ player1: { revealed: [x], goalCard: null }, player2: { revealed: [y], goalCard: null } })
  assert.equal(findCard(out, 'player1', 'X').finalValue, 6)  // X goes first and survives
  assert.equal(findCard(out, 'player2', 'Y').finalValue, 3)  // Y is cancelled before it can fire
  const again = resolveFinalBoard({ player1: { revealed: [x], goalCard: null }, player2: { revealed: [y], goalCard: null } })
  assert.deepEqual(again.player2.revealed, out.player2.revealed)
})

test('determineWinner: knocked-out cards do not count toward a goal color', () => {
  const out = determineWinner({
    player1GoalColor: 'BLACK', player2GoalColor: 'RED',
    player1Revealed: [{ finalValue: 5, color: 'BLUE' }],
    player2Revealed: [{ finalValue: 0, color: 'RED', cancelled: true }]
  })
  assert.equal(out.bonus, null)       // no +15: the only RED card was cancelled
  assert.equal(out.winner, 'player1')
})


test('resolveFinalBoard analysis: reports cancelled cards, the effects that no longer apply, and what changed', () => {
  const caster = at(revealedCard('A', 'Caster', { value: 2, color: 'GREEN', effect: [plus(5, { selector: 'cardByCharacter', character: 'Bee' }), recolor('RED', { selector: 'cardByCharacter', character: 'Bee' })] }), 1)
  const bee = at(revealedCard('B', 'Bee', { value: 3, color: 'BLUE', characters: ['Bee'] }), 2)
  const canceller = at(revealedCard('D', 'Canceller', { value: 2, effect: [negate({ selector: 'opponentActiveCard' })] }), 1)
  const out = resolveFinalBoard({
    player1: { revealed: [caster, bee], goalCard: null },
    player2: { revealed: [canceller], goalCard: null }
  })
  const a = out.analysis
  assert.deepEqual(a.knockedOut, [])
  assert.deepEqual(a.negated.map(n => [n.name, n.causes[0].by.name]), [['Caster', 'Canceller']])
  assert.equal(a.lostEffects.length, 2)
  assert.deepEqual(a.lostEffects.map(l => l.action).sort(), ['modifyValue', 'setColor'])
  assert.equal(a.lostEffects.every(l => l.targetName === 'Bee' && l.sourceName === 'Caster'), true)
  assert.equal(a.changes.length, 1)
  const c = a.changes[0]
  assert.deepEqual([c.name, c.fromValue, c.toValue, c.fromColor, c.toColor], ['Bee', 8, 3, 'RED', 'BLUE'])
  assert.equal(c.reasons.length, 2)
  assert.equal(c.reasons[0].causes[0].by.name, 'Canceller')
  assert.equal(c.slot, 2)
})

test('resolveFinalBoard analysis: a knocked-out duplicate lists the lost effects it would have had', () => {
  const twinA = at(revealedCard('T', 'Twin', { value: 4, effect: [plus(3, { selector: 'allOwnRevealed' })] }), 1)
  const twinB = at(revealedCard('T', 'Twin', { value: 4 }), 1)
  const mine = at(revealedCard('M', 'Mine', { value: 2 }), 2)
  const out = resolveFinalBoard({ player1: { revealed: [twinA, mine], goalCard: null }, player2: { revealed: [twinB], goalCard: null } })
  const a = out.analysis
  assert.equal(a.knockedOut.length, 2)
  assert.equal(a.lostEffects.length > 0, true)
  assert.equal(a.lostEffects.every(l => l.causes[0].kind === 'duplicate'), true)
  const mineChange = a.changes.find(x => x.name === 'Mine')
  assert.deepEqual([mineChange.fromValue, mineChange.toValue], [5, 2])
  assert.equal(a.changes.filter(x => x.cancelled).length, 2)
})

test('resolveFinalBoard analysis: nothing cancelled means nothing is reported as lost or changed', () => {
  const buffed = at(revealedCard('X', 'X', { value: 2, effect: [plus(3)] }), 1)
  const out = resolveFinalBoard({ player1: { revealed: [buffed], goalCard: null }, player2: { revealed: [at(revealedCard('Y', 'Y', { value: 1 }), 1)], goalCard: null } })
  assert.deepEqual(out.analysis, { knockedOut: [], negated: [], lostEffects: [], changes: [] })
})

test('assignRandomGoals picks one random card from each deck as that player\'s goal', async () => {
  const { assignRandomGoals, goalCardFor } = await import('../server/utils/ogGtoonEngine.js')
  const mk = colors => colors.map((color, i) => ({ color, name: `c${i}` }))
  const match = { deckOrder: [mk(['RED', 'BLUE', 'GREEN', 'PINK']), mk(['BLACK', 'YELLOW', 'ORANGE', 'PURPLE'])] }
  assignRandomGoals(match, () => 0.5)
  assert.deepEqual(match.goalCardIdx, [2, 2])
  assert.deepEqual(match.goalColor, ['GREEN', 'ORANGE'])
  assert.equal(goalCardFor(match, 0).name, 'c2')
  // Matches without goalCardIdx (legacy) still use slot 11.
  const legacy = { deckOrder: [new Array(12).fill(null).map((_, i) => ({ name: `c${i}` })), []] }
  assert.equal(goalCardFor(legacy, 0).name, 'c11')
})

test('assignRandomGoals: a deck with only Black/Silver cards has no target color', () => {
  const deck = Array.from({ length: 12 }, (_, i) => ({ color: i % 2 ? 'BLACK' : 'SILVER' }))
  const match = assignRandomGoals({ deckOrder: [deck, deck] })
  assert.deepEqual(match.goalCardIdx, [null, null])
  assert.deepEqual(match.goalColor, ['BLACK', 'BLACK'])
})

test('determineWinner: both players reveal the same color -> one target color, +15 bonus, points decide', () => {
  const card = (color, v) => ({ color, finalValue: v })
  const out = determineWinner({
    player1GoalColor: 'RED', player2GoalColor: 'RED',
    player1Revealed: [card('RED', 1), card('RED', 1), card('BLUE', 1)],
    player2Revealed: [card('RED', 20), card('BLUE', 10)]
  })
  assert.equal(out.reason, 'total_value')
  assert.equal(out.bonus.player, 'player1')
  assert.equal(out.player1Score, 18)
  assert.equal(out.winner, 'player2')
})
