import { test } from 'node:test'
import assert from 'node:assert/strict'

import { findSlotsUsingPath } from '../server/utils/uiSoundLibraryUsage.js'

test('finds the default slot when uiClickSoundPath matches', () => {
  const config = { uiClickSoundPath: '/ui-sounds/a.mp3', uiNavButtonSounds: null }
  assert.deepEqual(findSlotsUsingPath(config, '/ui-sounds/a.mp3'), ['Default (every other button)'])
})

test('finds nav slots referencing the path, alongside the default when both match', () => {
  const config = {
    uiClickSoundPath: '/ui-sounds/a.mp3',
    uiNavButtonSounds: { home: '/ui-sounds/a.mp3', cmart: '/ui-sounds/b.mp3' }
  }
  const labels = findSlotsUsingPath(config, '/ui-sounds/a.mp3')
  assert.equal(labels.includes('Default (every other button)'), true)
  assert.equal(labels.includes('ReOrbit Home'), true)
  assert.equal(labels.length, 2)
})

test('returns an empty list when nothing references the path', () => {
  const config = {
    uiClickSoundPath: '/ui-sounds/a.mp3',
    uiNavButtonSounds: { home: '/ui-sounds/a.mp3' }
  }
  assert.deepEqual(findSlotsUsingPath(config, '/ui-sounds/unused.mp3'), [])
})

test('handles a missing/malformed config gracefully', () => {
  assert.deepEqual(findSlotsUsingPath(null, '/ui-sounds/a.mp3'), [])
  assert.deepEqual(findSlotsUsingPath({}, '/ui-sounds/a.mp3'), [])
  assert.deepEqual(findSlotsUsingPath({ uiNavButtonSounds: 'not-an-object' }, '/ui-sounds/a.mp3'), [])
})

test('ignores an unknown key in uiNavButtonSounds rather than throwing', () => {
  const config = { uiNavButtonSounds: { 'stale-removed-slot': '/ui-sounds/a.mp3' } }
  assert.deepEqual(findSlotsUsingPath(config, '/ui-sounds/a.mp3'), [])
})

test('returns an empty list for a falsy path', () => {
  assert.deepEqual(findSlotsUsingPath({ uiClickSoundPath: '' }, ''), [])
})
