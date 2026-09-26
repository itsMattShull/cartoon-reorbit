import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveGoalColor, validateDeckPositions, canCommitCard, applyBatchCommit, isBatchFull,
  BATCH_QUOTAS, determineWinner
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

test('BATCH_QUOTAS sums to the 7-round total', () => {
  assert.deepEqual(BATCH_QUOTAS, [4, 2, 1])
  assert.equal(BATCH_QUOTAS.reduce((a, b) => a + b, 0), 7)
})

test('canCommitCard rejects an unavailable position, a duplicate pending pick, a full batch, and the reserved goal card', () => {
  const remainingIdx = [0, 1, 2, 11]
  assert.equal(canCommitCard({ remainingIdx, pending: [], position: 5, quota: 4, allowGoalCard: false }).ok, false) // not in remainingIdx
  assert.equal(canCommitCard({ remainingIdx, pending: [0], position: 0, quota: 4, allowGoalCard: false }).ok, false) // already pending
  assert.equal(canCommitCard({ remainingIdx, pending: [0, 1, 2], position: 1, quota: 3, allowGoalCard: false }).ok, false) // batch already full
  assert.equal(canCommitCard({ remainingIdx, pending: [], position: 11, quota: 1, allowGoalCard: false }).ok, false) // goal card reserved
  assert.equal(canCommitCard({ remainingIdx, pending: [], position: 11, quota: 1, allowGoalCard: true }).ok, true) // goal card allowed in sudden death
  assert.equal(canCommitCard({ remainingIdx, pending: [], position: 0, quota: 4, allowGoalCard: false }).ok, true)
})

test('applyBatchCommit moves a position from remainingIdx to pending, never mutating the input', () => {
  const remainingIdx = [0, 1, 2, 3]
  const pending = [0]
  const next = applyBatchCommit(remainingIdx, pending, 2)
  assert.deepEqual(next.remainingIdx, [0, 1, 3])
  assert.deepEqual(next.pending, [0, 2])
  assert.deepEqual(remainingIdx, [0, 1, 2, 3]) // unchanged
  assert.deepEqual(pending, [0]) // unchanged
})

test('isBatchFull compares pending length against the quota', () => {
  assert.equal(isBatchFull([0, 1, 2], 4), false)
  assert.equal(isBatchFull([0, 1, 2, 3], 4), true)
  assert.equal(isBatchFull([], 1), false)
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

test('determineWinner: both non-neutral -> outright win requires MORE of BOTH goal colors', () => {
  const out = determineWinner({
    player1GoalColor: 'RED',
    player2GoalColor: 'BLUE',
    player1Revealed: revealed([[1, 'RED'], [1, 'RED'], [1, 'BLUE']]), // 2 RED, 1 BLUE
    player2Revealed: revealed([[1, 'RED'], [1, 'BLUE'], [1, 'BLUE']]) // 1 RED, 2 BLUE
  })
  // player1 does not have MORE blue than player2, and player2 does not have MORE red than
  // player1 -- neither wins outright, so it falls back to total value (a tie here: 3 vs 3).
  assert.equal(out.winner, null)
  assert.equal(out.reason, 'tie')
})

test('determineWinner: both non-neutral, one player leads BOTH colors -> outright win regardless of total value', () => {
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

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * Feature 5: duplicate-character cancellation (phase 0 of resolveFinalBoard).
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

test('resolveFinalBoard: duplicate-character cancellation destroys the lower-baseValue copy', () => {
  const strong = revealedCard('c1', 'Bugs Bunny (Strong)', { value: 8, characters: ['Bugs Bunny'] })
  const weak = revealedCard('c2', 'Bugs Bunny (Weak)', { value: 3, characters: ['Bugs Bunny'] })
  const out = resolveFinalBoard({
    player1: { revealed: [strong], goalCard: null },
    player2: { revealed: [weak], goalCard: null }
  })
  assert.equal(out.player1.revealed[0].finalValue, 8)
  assert.equal(out.player1.revealed[0].cancelled, false)
  assert.equal(out.player2.revealed[0].finalValue, 0)
  assert.equal(out.player2.revealed[0].cancelled, true)
  assert.ok(out.effectsResolved.some(e => e.action === 'cancel' && e.sourceCtoonId === 'c2'))
})

test('resolveFinalBoard: an exact-tie duplicate-character pair cancels BOTH sides', () => {
  const a = revealedCard('t1', 'Tie A', { value: 5, characters: ['Same Guy'] })
  const b = revealedCard('t2', 'Tie B', { value: 5, characters: ['Same Guy'] })
  const out = resolveFinalBoard({
    player1: { revealed: [a], goalCard: null },
    player2: { revealed: [b], goalCard: null }
  })
  assert.equal(out.player1.revealed[0].finalValue, 0)
  assert.equal(out.player1.revealed[0].cancelled, true)
  assert.equal(out.player2.revealed[0].finalValue, 0)
  assert.equal(out.player2.revealed[0].cancelled, true)
})

test('resolveFinalBoard: a cancelled card\'s own onReveal effect never fires', () => {
  const weak = revealedCard('w1', 'Weak Duplicate', {
    value: 1, characters: ['Duped'],
    effect: [{ trigger: 'onReveal', target: { selector: 'self' }, action: { type: 'modifyValue', operation: 'add', amount: 100 } }]
  })
  const strong = revealedCard('s1', 'Strong Duplicate', { value: 9, characters: ['Duped'] })
  const out = resolveFinalBoard({
    player1: { revealed: [weak], goalCard: null },
    player2: { revealed: [strong], goalCard: null }
  })
  assert.equal(out.player1.revealed[0].finalValue, 0) // cancelled -- its own +100 never applies
  assert.ok(!out.effectsResolved.some(e => e.action === 'modifyValue' && e.sourceCtoonId === 'w1'))
})

test('resolveFinalBoard: a cancelled card is invisible to an opponent\'s perMatch count', () => {
  const cancelledProp = revealedCard('cp1', 'Cancelled Prop', { value: 1, type1: 'PROP', characters: ['Duped Prop'] })
  const survivorSameChar = revealedCard('cp2', 'Surviving Prop', { value: 5, type1: 'PROP', characters: ['Duped Prop'] })
  const counter = revealedCard('cp3', 'Prop Counter', {
    value: 0,
    effect: [{ trigger: 'onReveal', target: { selector: 'self' }, action: { type: 'modifyValue', operation: 'add', amount: 1, perMatch: { by: 'type', value: 'PROP', scope: 'both' } } }]
  })
  const out = resolveFinalBoard({
    player1: { revealed: [cancelledProp], goalCard: null },
    player2: { revealed: [survivorSameChar, counter], goalCard: null }
  })
  assert.equal(out.player1.revealed[0].cancelled, true) // cancelledProp: value 1 < 5
  // Only survivorSameChar counts as an in-play PROP -- cancelledProp is excluded, counter itself isn't a PROP.
  assert.equal(out.player2.revealed[1].finalValue, 1) // 0 + 1*1
})

test('resolveFinalBoard: cancellation does not manufacture new adjacency (a gap stays a gap)', () => {
  const first = revealedCard('adj0', 'First', { value: 1, type1: 'ANIMAL' })
  const cancelledMiddle = revealedCard('adjM', 'Middle (will cancel)', { value: 1, characters: ['Doomed'] })
  const strongerDup = revealedCard('adjD', 'Stronger Duplicate', { value: 9, characters: ['Doomed'] })
  const third = revealedCard('adj2', 'Third', {
    value: 5,
    effect: [{ trigger: 'onReveal', target: { selector: 'neighborOwn', filter: { by: 'type', value: 'ANIMAL' } }, action: { type: 'modifyValue', operation: 'add', amount: 100 } }]
  })
  // Own-side order: [first, cancelledMiddle, third] -> roundIndex 0,1,2. If cancellation
  // re-indexed the remaining cards after filtering, third would become "array index 1" and its
  // linear -1 neighbor would wrongly resolve to first. It must not: third's roundIndex stays 2,
  // whose only linear neighbors are roundIndex 1 (the now-absent cancelledMiddle) and 3
  // (nonexistent) -- so first (roundIndex 0) must be completely untouched.
  const out = resolveFinalBoard({
    player1: { revealed: [first, cancelledMiddle, third], goalCard: null },
    player2: { revealed: [strongerDup], goalCard: null }
  })
  assert.equal(out.player1.revealed[1].cancelled, true) // cancelledMiddle: value 1 < 9
  assert.equal(out.player1.revealed[0].finalValue, 1) // first: unaffected
})

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * Feature 6: adjacencyMode 'graph' + bounded setColor cascade.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

test('resolveFinalBoard: adjacencyMode "graph" reaches the richer 7-node neighbor graph, not just linear prev/next', () => {
  const buffer = revealedCard('g0', 'Graph Buffer', {
    value: 0,
    effect: [{ trigger: 'onReveal', target: { selector: 'neighborOwn', adjacencyMode: 'graph' }, action: { type: 'modifyValue', operation: 'add', amount: 10 } }]
  })
  const cards = [buffer]
  for (let i = 1; i <= 6; i++) cards.push(revealedCard(`g${i}`, `Card ${i}`, { value: i }))
  const out = resolveFinalBoard({
    player1: { revealed: cards, goalCard: null },
    player2: { revealed: [revealedCard('opp', 'Opp Filler', { value: 0 })], goalCard: null }
  })
  // buffer is roundIndex 0; ADJACENCY_GRAPH[0] = [1, 4] -> only roundIndex 1 and 4 get +10.
  assert.equal(out.player1.revealed[1].finalValue, 11) // Card 1: 1 + 10
  assert.equal(out.player1.revealed[2].finalValue, 2) // Card 2: untouched
  assert.equal(out.player1.revealed[3].finalValue, 3) // Card 3: untouched
  assert.equal(out.player1.revealed[4].finalValue, 14) // Card 4: 4 + 10
  assert.equal(out.player1.revealed[5].finalValue, 5) // Card 5: untouched
  assert.equal(out.player1.revealed[6].finalValue, 6) // Card 6: untouched
})

test('resolveFinalBoard: omitting adjacencyMode keeps the original strict linear prev/next behavior', () => {
  const buffer = revealedCard('l0', 'Linear Buffer', {
    value: 0,
    effect: [{ trigger: 'onReveal', target: { selector: 'neighborOwn' }, action: { type: 'modifyValue', operation: 'add', amount: 10 } }]
  })
  const cards = [buffer]
  for (let i = 1; i <= 6; i++) cards.push(revealedCard(`l${i}`, `Card ${i}`, { value: i }))
  const out = resolveFinalBoard({
    player1: { revealed: cards, goalCard: null },
    player2: { revealed: [revealedCard('opp2', 'Opp Filler', { value: 0 })], goalCard: null }
  })
  assert.equal(out.player1.revealed[1].finalValue, 11) // Card 1: only linear neighbor, 1 + 10
  assert.equal(out.player1.revealed[4].finalValue, 4) // Card 4: a graph neighbor, but NOT a linear one -- untouched
})

test('resolveFinalBoard: setColor cascades across passes when one effect depends on a color another effect just set', () => {
  const cardA = revealedCard('ca', 'Card A', {
    value: 0, color: 'BLUE',
    effect: [{ trigger: 'onReveal', target: { selector: 'self' }, condition: { type: 'colorInPlay', color: 'RED', side: 'opponent' }, action: { type: 'setColor', color: 'GREEN' } }]
  })
  const cardB = revealedCard('cb', 'Card B', {
    value: 0, color: 'BLUE',
    effect: [{ trigger: 'onReveal', target: { selector: 'self' }, condition: { type: 'colorInPlay', color: 'BLUE', side: 'opponent' }, action: { type: 'setColor', color: 'RED' } }]
  })
  const out = resolveFinalBoard({
    player1: { revealed: [cardA], goalCard: null },
    player2: { revealed: [cardB], goalCard: null }
  })
  // Pass 1: B sees A=BLUE (opponent, unconditioned yet) -> B becomes RED. A sees B=BLUE (still,
  // checked before B's own change since player1 resolves first within the pass) -> no change.
  // Pass 2: A now sees B=RED (set last pass) -> A becomes GREEN. A single-pass resolver could
  // never reach this -- it would have stopped after pass 1 with A still BLUE.
  assert.equal(out.player1.revealed[0].color, 'GREEN')
  assert.equal(out.player2.revealed[0].color, 'RED')
  assert.equal(out.effectsResolved.filter(e => e.action === 'setColor').length, 2)
})

test('resolveFinalBoard: an oscillating color pair terminates at the pass cap instead of hanging', () => {
  const cardA = revealedCard('oa', 'Oscillator A', {
    value: 0, color: 'BLUE',
    effect: [
      { trigger: 'onReveal', target: { selector: 'self' }, condition: { type: 'colorInPlay', color: 'BLUE', side: 'opponent' }, action: { type: 'setColor', color: 'RED' } },
      { trigger: 'onReveal', target: { selector: 'self' }, condition: { type: 'colorInPlay', color: 'RED', side: 'opponent' }, action: { type: 'setColor', color: 'BLUE' } }
    ]
  })
  const cardB = revealedCard('ob', 'Oscillator B', {
    value: 0, color: 'BLUE',
    effect: [
      { trigger: 'onReveal', target: { selector: 'self' }, condition: { type: 'colorInPlay', color: 'BLUE', side: 'opponent' }, action: { type: 'setColor', color: 'BLUE' } },
      { trigger: 'onReveal', target: { selector: 'self' }, condition: { type: 'colorInPlay', color: 'RED', side: 'opponent' }, action: { type: 'setColor', color: 'RED' } }
    ]
  })
  const start = Date.now()
  const out = resolveFinalBoard({
    player1: { revealed: [cardA], goalCard: null },
    player2: { revealed: [cardB], goalCard: null }
  })
  assert.ok(Date.now() - start < 2000, 'must terminate promptly, not hang')
  const colorChanges = out.effectsResolved.filter(e => e.action === 'setColor')
  assert.equal(colorChanges.length, 20) // 10 passes (the cap) x 2 real flips/pass, never stabilizes
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
