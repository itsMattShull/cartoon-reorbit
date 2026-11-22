import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isGameRoute, GAME_ROUTE_PREFIXES } from '../utils/gameRoutePrefixes.js'

test('isGameRoute matches known game pages and their sub-paths', () => {
  assert.equal(isGameRoute('/winball'), true)
  assert.equal(isGameRoute('/asteroid'), true)
  assert.equal(isGameRoute('/blackjack'), true)
})

test('isGameRoute does not match unrelated pages', () => {
  assert.equal(isGameRoute('/economy'), false)
  assert.equal(isGameRoute('/cmart'), false)
  assert.equal(isGameRoute('/settings'), false)
})

test('isGameRoute does not false-positive on a page name that merely shares a prefix', () => {
  // A plain startsWith() would wrongly match these against '/winball' and
  // '/tower' respectively.
  assert.equal(isGameRoute('/winballhistory'), false)
  assert.equal(isGameRoute('/towerofpower'), false)
})

test('isGameRoute matches sub-paths of a game route', () => {
  assert.equal(isGameRoute('/winball/leaderboard'), true)
})

test('isGameRoute rejects non-string input', () => {
  assert.equal(isGameRoute(null), false)
  assert.equal(isGameRoute(undefined), false)
})

test('GAME_ROUTE_PREFIXES has no duplicate entries', () => {
  assert.equal(new Set(GAME_ROUTE_PREFIXES).size, GAME_ROUTE_PREFIXES.length)
})
