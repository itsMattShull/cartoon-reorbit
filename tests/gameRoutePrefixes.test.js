import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isGameRoute, GAME_ROUTE_PREFIXES } from '../utils/gameRoutePrefixes.js'

test('isGameRoute matches known game pages and their sub-paths', () => {
  assert.equal(isGameRoute('/newsite/winball'), true)
  assert.equal(isGameRoute('/newsite/asteroid'), true)
  assert.equal(isGameRoute('/newsite/blackjack'), true)
})

test('isGameRoute does not match unrelated pages', () => {
  assert.equal(isGameRoute('/newsite/economy'), false)
  assert.equal(isGameRoute('/newsite/cmart'), false)
  assert.equal(isGameRoute('/newsite/settings'), false)
})

test('isGameRoute does not false-positive on a page name that merely shares a prefix', () => {
  // A plain startsWith() would wrongly match these against '/newsite/winball' and
  // '/newsite/tower' respectively.
  assert.equal(isGameRoute('/newsite/winballhistory'), false)
  assert.equal(isGameRoute('/newsite/towerofpower'), false)
})

test('isGameRoute matches sub-paths of a game route', () => {
  assert.equal(isGameRoute('/newsite/winball/leaderboard'), true)
})

test('isGameRoute rejects non-string input', () => {
  assert.equal(isGameRoute(null), false)
  assert.equal(isGameRoute(undefined), false)
})

test('GAME_ROUTE_PREFIXES has no duplicate entries', () => {
  assert.equal(new Set(GAME_ROUTE_PREFIXES).size, GAME_ROUTE_PREFIXES.length)
})
