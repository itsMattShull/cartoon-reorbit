import { test } from 'node:test'
import assert from 'node:assert/strict'

import { NAV_SOUND_SLOTS, NAV_SOUND_SLOT_KEYS, isNavSoundSlotKey } from '../utils/navSoundSlots.js'

test('NAV_SOUND_SLOTS includes the "default" meta-slot and has no duplicate keys', () => {
  assert.equal(NAV_SOUND_SLOTS.some(s => s.key === 'default'), true)
  const keys = NAV_SOUND_SLOTS.map(s => s.key)
  assert.equal(new Set(keys).size, keys.length)
})

test('every slot has a non-empty label', () => {
  for (const slot of NAV_SOUND_SLOTS) {
    assert.equal(typeof slot.label, 'string')
    assert.ok(slot.label.length > 0)
  }
})

test('NAV_SOUND_SLOT_KEYS matches the slot list', () => {
  assert.deepEqual(
    [...NAV_SOUND_SLOT_KEYS].sort(),
    NAV_SOUND_SLOTS.map(s => s.key).sort()
  )
})

test('isNavSoundSlotKey accepts known keys and rejects everything else', () => {
  assert.equal(isNavSoundSlotKey('default'), true)
  assert.equal(isNavSoundSlotKey('home'), true)
  assert.equal(isNavSoundSlotKey('games'), true)
  assert.equal(isNavSoundSlotKey('not-a-slot'), false)
  assert.equal(isNavSoundSlotKey(''), false)
  assert.equal(isNavSoundSlotKey(null), false)
  assert.equal(isNavSoundSlotKey(undefined), false)
  assert.equal(isNavSoundSlotKey(42), false)
})
