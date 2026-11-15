import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFirstRoundPairings, checkByeAdvance, pairNextRound, isRoundComplete, isTournamentComplete, bracketRoundLabel,
} from '../server/utils/cmoonPvpTournament.js'

test('buildFirstRoundPairings: a power-of-two field pairs top seeds against bottom seeds, no byes', () => {
  const entries = ['e1', 'e2', 'e3', 'e4']
  const pairs = buildFirstRoundPairings(entries)
  assert.deepEqual(pairs, [
    { entryAId: 'e1', entryBId: 'e4' },
    { entryAId: 'e2', entryBId: 'e3' },
  ])
})

test('buildFirstRoundPairings: a non-power-of-two field gets byes for the top seeds', () => {
  // 3 entrants -> bracketSizeFor rounds up to 4 -> seed 4 is a missing slot (bye).
  const entries = ['e1', 'e2', 'e3']
  const pairs = buildFirstRoundPairings(entries)
  assert.deepEqual(pairs, [
    { entryAId: 'e1', entryBId: null },
    { entryAId: 'e2', entryBId: 'e3' },
  ])
})

test('checkByeAdvance: exactly one real entry advances automatically, two or zero do not', () => {
  assert.equal(checkByeAdvance({ entryAId: 'e1', entryBId: null }), 'e1')
  assert.equal(checkByeAdvance({ entryAId: null, entryBId: 'e2' }), 'e2')
  assert.equal(checkByeAdvance({ entryAId: 'e1', entryBId: 'e2' }), null)
  assert.equal(checkByeAdvance({ entryAId: null, entryBId: null }), null)
})

test('pairNextRound: pairs adjacent winners in bracket order', () => {
  const winners = ['w1', 'w2', 'w3', 'w4']
  assert.deepEqual(pairNextRound(winners), [
    { entryAId: 'w1', entryBId: 'w2' },
    { entryAId: 'w3', entryBId: 'w4' },
  ])
})

test('pairNextRound: a final round of two winners produces the one Final pairing', () => {
  assert.deepEqual(pairNextRound(['wA', 'wB']), [{ entryAId: 'wA', entryBId: 'wB' }])
})

test('isRoundComplete: true only once every match in the round has a winner', () => {
  assert.equal(isRoundComplete([{ winnerEntryId: 'e1' }, { winnerEntryId: 'e2' }]), true)
  assert.equal(isRoundComplete([{ winnerEntryId: 'e1' }, { winnerEntryId: null }]), false)
  assert.equal(isRoundComplete([]), false)
})

test('isTournamentComplete: true only for a resolved one-match (Final) round', () => {
  assert.equal(isTournamentComplete([{ winnerEntryId: 'champ' }]), true)
  assert.equal(isTournamentComplete([{ winnerEntryId: 'w1' }, { winnerEntryId: 'w2' }]), false)
  assert.equal(isTournamentComplete([{ winnerEntryId: null }]), false)
})

test('bracketRoundLabel is re-exported from tournamentCore.js unchanged', () => {
  assert.equal(bracketRoundLabel(1), 'Final')
  assert.equal(bracketRoundLabel(2), 'Semifinals')
  assert.equal(bracketRoundLabel(4), 'Quarterfinals')
  assert.equal(bracketRoundLabel(8), 'Round of 16')
})
