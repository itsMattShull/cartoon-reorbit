import test from 'node:test'
import assert from 'node:assert/strict'
import { stripNewsitePrefix } from '../utils/oldNewsitePath.js'

test('old /newsite URLs map to the same page without the prefix', () => {
  assert.equal(stripNewsitePrefix('/newsite/cmart'), '/cmart')
  assert.equal(stripNewsitePrefix('/newsite/czone/Bob'), '/czone/Bob')
  assert.equal(stripNewsitePrefix('/newsite/AuctionHouse/abc-123'), '/AuctionHouse/abc-123')
  assert.equal(stripNewsitePrefix('/newsite/admin/ctoons/edit/42'), '/admin/ctoons/edit/42')
})

test('the bare prefix goes to the signed-in home page', () => {
  assert.equal(stripNewsitePrefix('/newsite'), '/home')
  assert.equal(stripNewsitePrefix('/newsite/'), '/home')
})

test('paths that are not under the old prefix are left alone', () => {
  assert.equal(stripNewsitePrefix('/'), null)
  assert.equal(stripNewsitePrefix('/cmart'), null)
  assert.equal(stripNewsitePrefix('/newsitemap'), null)
  assert.equal(stripNewsitePrefix('/api/newsite/x'), null)
  assert.equal(stripNewsitePrefix(undefined), null)
})

test('the result can never be a protocol-relative URL', () => {
  assert.equal(stripNewsitePrefix('/newsite//evil.example'), '/evil.example')
  assert.equal(stripNewsitePrefix('/newsite///evil.example/x'), '/evil.example/x')
})
