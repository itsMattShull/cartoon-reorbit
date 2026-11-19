import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MYORBIT_EMOTES, isValidMyOrbitEmote, myOrbitEmoteIcon } from '../utils/myOrbitEmotes.js'

test('MYORBIT_EMOTES: every entry has a unique key, a non-empty icon, and a label', () => {
  const keys = new Set()
  for (const e of MYORBIT_EMOTES) {
    assert.equal(typeof e.key, 'string')
    assert.ok(e.key.length > 0)
    assert.ok(!keys.has(e.key), `duplicate emote key: ${e.key}`)
    keys.add(e.key)
    assert.equal(typeof e.icon, 'string')
    assert.ok(e.icon.length > 0)
    assert.equal(typeof e.label, 'string')
    assert.ok(e.label.length > 0)
  }
})

test('isValidMyOrbitEmote: accepts every real key, rejects everything else', () => {
  for (const e of MYORBIT_EMOTES) assert.equal(isValidMyOrbitEmote(e.key), true)
  assert.equal(isValidMyOrbitEmote('not-a-real-emote'), false)
  assert.equal(isValidMyOrbitEmote(''), false)
  assert.equal(isValidMyOrbitEmote(null), false)
  assert.equal(isValidMyOrbitEmote(undefined), false)
  assert.equal(isValidMyOrbitEmote(42), false)
  assert.equal(isValidMyOrbitEmote({}), false)
})

test('myOrbitEmoteIcon: returns the right icon for a real key, null for anything else', () => {
  for (const e of MYORBIT_EMOTES) assert.equal(myOrbitEmoteIcon(e.key), e.icon)
  assert.equal(myOrbitEmoteIcon('not-a-real-emote'), null)
  assert.equal(myOrbitEmoteIcon(null), null)
})
