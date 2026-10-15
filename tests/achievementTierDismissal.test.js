import test from 'node:test'
import assert from 'node:assert/strict'
import { annotateAndFilterTierClaims } from '../server/utils/achievementTierDismissal.js'

const candidates = [
  { id: 'ach-cmoonA-underboss', cMoonRankTierId: 'tier-underboss' },
  { id: 'ach-cmoonB-enforcer', cMoonRankTierId: 'tier-enforcer' },
]

test('annotateAndFilterTierClaims: flags a candidate whose tier was claimed via a DIFFERENT achievement', () => {
  const result = annotateAndFilterTierClaims(candidates, ['tier-underboss'], [])
  assert.equal(result.length, 2)
  assert.equal(result.find(c => c.id === 'ach-cmoonA-underboss').blockedElsewhere, true)
  assert.equal(result.find(c => c.id === 'ach-cmoonB-enforcer').blockedElsewhere, false)
})

test('annotateAndFilterTierClaims: no claimed tiers means nothing is blocked', () => {
  const result = annotateAndFilterTierClaims(candidates, [], [])
  assert.ok(result.every(c => c.blockedElsewhere === false))
})

test('annotateAndFilterTierClaims: a dismissed candidate is dropped entirely, not just flagged', () => {
  const result = annotateAndFilterTierClaims(candidates, ['tier-underboss'], ['ach-cmoonA-underboss'])
  assert.equal(result.length, 1)
  assert.equal(result[0].id, 'ach-cmoonB-enforcer')
})

test('annotateAndFilterTierClaims: handles empty/missing inputs without throwing', () => {
  assert.deepEqual(annotateAndFilterTierClaims([], [], []), [])
  assert.deepEqual(annotateAndFilterTierClaims(null, null, null), [])
  assert.deepEqual(annotateAndFilterTierClaims(undefined, undefined, undefined), [])
})

test('annotateAndFilterTierClaims: preserves every original field on the candidate', () => {
  const result = annotateAndFilterTierClaims(
    [{ id: 'a', cMoonRankTierId: 't', title: 'Underboss', claimOptions: [{ id: 'o1' }] }],
    [],
    [],
  )
  assert.equal(result[0].title, 'Underboss')
  assert.deepEqual(result[0].claimOptions, [{ id: 'o1' }])
  assert.equal(result[0].blockedElsewhere, false)
})
