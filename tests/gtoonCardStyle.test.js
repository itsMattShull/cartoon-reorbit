import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeGtoonCardStyle, defaultGtoonCardStyle, GTOON_PALETTE, GTOON_COLOR_ORDER } from '../utils/gtoonCardStyle.js'
import { ogGtoonDisplay, parseGtoonCardStyleInput } from '../server/utils/ogGtoonDisplay.js'

test('null / garbage input falls back to defaults', () => {
  assert.deepEqual(sanitizeGtoonCardStyle(null), defaultGtoonCardStyle())
  assert.deepEqual(sanitizeGtoonCardStyle('{not json'), defaultGtoonCardStyle())
  assert.deepEqual(sanitizeGtoonCardStyle(42), defaultGtoonCardStyle())
})

test('values are clamped and effect keys whitelisted + de-duplicated', () => {
  const s = sanitizeGtoonCardStyle({
    rotation: 999, theme: 'nope', oneShot: ['lensFlare', 'evil', 'lensFlare'], ambient: ['plasma', 'x'],
    params: { flareMs: 5, blackHoleMs: 1e9, lightningDelay: 'abc', pulseLoop: 'yes' }
  })
  assert.equal(s.rotation, 180)
  assert.equal(s.theme, 'default')
  assert.deepEqual(s.oneShot, ['lensFlare'])
  assert.deepEqual(s.ambient, ['plasma'])
  assert.equal(s.params.flareMs, 300)
  assert.equal(s.params.blackHoleMs, 8000)
  assert.equal(s.params.lightningDelay, 2000)
  assert.equal(s.params.pulseLoop, false)
})

test('accepts a JSON string', () => {
  assert.equal(sanitizeGtoonCardStyle('{"theme":"cosmic"}').theme, 'cosmic')
})

test('every gToon color has a palette entry (incl. PINK)', () => {
  for (const c of ['BLACK', 'SILVER', 'BLUE', 'RED', 'YELLOW', 'GREEN', 'PURPLE', 'ORANGE', 'PINK']) {
    assert.ok(GTOON_PALETTE[c], c)
    assert.ok(GTOON_COLOR_ORDER.includes(c), c)
  }
})

test('ogGtoonDisplay only exposes card fields for OG gToons', () => {
  assert.deepEqual(ogGtoonDisplay({ isOgGtoon: false, gtoonValue: 5 }), { isOgGtoon: false })
  const d = ogGtoonDisplay({ isOgGtoon: true, gtoonColor: 'RED', gtoonValue: 7, gtoonCardStyle: null })
  assert.equal(d.isOgGtoon, true)
  assert.equal(d.gtoonColor, 'RED')
  assert.equal(d.gtoonValue, 7)
  assert.deepEqual(d.gtoonCardStyle, defaultGtoonCardStyle())
})

test('parseGtoonCardStyleInput treats empty as null', () => {
  assert.equal(parseGtoonCardStyleInput(''), null)
  assert.equal(parseGtoonCardStyleInput(undefined), null)
  assert.equal(parseGtoonCardStyleInput('{"rotation":10}').rotation, 10)
})
