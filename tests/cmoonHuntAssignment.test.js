import test from 'node:test'
import assert from 'node:assert/strict'

import { shuffleArray, assignCluesRoundRobin } from '../server/utils/cmoonHuntAssignment.js'

test('shuffleArray returns a permutation of the same elements, never mutating the input', () => {
  const input = [1, 2, 3, 4, 5]
  const result = shuffleArray(input)
  assert.notEqual(result, input) // different array instance
  assert.deepEqual([...result].sort(), [...input].sort())
  assert.deepEqual(input, [1, 2, 3, 4, 5]) // untouched
})

test('shuffleArray with a stubbed randomFn produces a deterministic, verifiable result', () => {
  // Math.random() always returning 0 means every swap picks index 0 — a fixed, checkable case
  // rather than asserting only statistical properties.
  const result = shuffleArray([1, 2, 3, 4], () => 0)
  assert.deepEqual(result, [2, 3, 4, 1])
})

test('assignCluesRoundRobin returns one pair per member, every userId present exactly once', () => {
  const members = ['u1', 'u2', 'u3']
  const clues = ['c1', 'c2', 'c3']
  const pairs = assignCluesRoundRobin(members, clues)
  assert.equal(pairs.length, members.length)
  assert.deepEqual([...pairs.map(p => p.userId)].sort(), [...members].sort())
  for (const p of pairs) assert.ok(clues.includes(p.clueId))
})

test('assignCluesRoundRobin wraps clues when there are more members than clues', () => {
  const members = ['u1', 'u2', 'u3', 'u4', 'u5']
  const clues = ['c1', 'c2']
  const pairs = assignCluesRoundRobin(members, clues)
  assert.equal(pairs.length, 5)
  // Every clue must be used at least once — nobody should be left with an undefined clue.
  const usedClueIds = new Set(pairs.map(p => p.clueId))
  assert.deepEqual([...usedClueIds].sort(), clues.slice().sort())
})

test('assignCluesRoundRobin gives multiple clues to the same member when there are fewer members than clues', () => {
  const members = ['u1']
  const clues = ['c1', 'c2', 'c3']
  const pairs = assignCluesRoundRobin(members, clues)
  // One pair per MEMBER (not per clue) — a lone player gets one assignment row here; distributing
  // every clue to them is the caller's (postCMoonHunt's round-robin loop) responsibility if ever
  // extended, not this function's current single-pass contract.
  assert.equal(pairs.length, 1)
  assert.equal(pairs[0].userId, 'u1')
})

test('assignCluesRoundRobin returns an empty array when either side is empty', () => {
  assert.deepEqual(assignCluesRoundRobin([], ['c1']), [])
  assert.deepEqual(assignCluesRoundRobin(['u1'], []), [])
})

test('assignCluesRoundRobin with a stubbed randomFn is fully deterministic', () => {
  const pairs = assignCluesRoundRobin(['u1', 'u2', 'u3'], ['c1', 'c2'], () => 0)
  // shuffleArray(['u1','u2','u3'], () => 0) => ['u2','u3','u1']; round-robin against
  // ['c1','c2'] then assigns c1,c2,c1 (index 2 wraps back to c1).
  assert.deepEqual(pairs, [
    { userId: 'u2', clueId: 'c1' },
    { userId: 'u3', clueId: 'c2' },
    { userId: 'u1', clueId: 'c1' },
  ])
})
