import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isValidUiClickSoundPath } from '../server/utils/uiClickSoundPath.js'

test('isValidUiClickSoundPath accepts server-generated dev and prod paths', () => {
  assert.equal(isValidUiClickSoundPath('/ui-sounds/click-default.mp3'), true)
  assert.equal(isValidUiClickSoundPath('/ui-sounds/ui-click-sound-1730000000000.mp3'), true)
  assert.equal(isValidUiClickSoundPath('/images/ui-sounds/ui-click-sound-1730000000000.ogg'), true)
  assert.equal(isValidUiClickSoundPath('/ui-sounds/ui-click-sound-1730000000000.wav'), true)
})

test('isValidUiClickSoundPath rejects everything that is not that exact shape', () => {
  assert.equal(isValidUiClickSoundPath(null), false)
  assert.equal(isValidUiClickSoundPath(undefined), false)
  assert.equal(isValidUiClickSoundPath(''), false)
  assert.equal(isValidUiClickSoundPath('javascript:alert(1)'), false)
  assert.equal(isValidUiClickSoundPath('https://evil.example/x.mp3'), false)
  assert.equal(isValidUiClickSoundPath('//evil.example/x.mp3'), false)
  assert.equal(isValidUiClickSoundPath('/ui-sounds/../../etc/passwd'), false)
  assert.equal(isValidUiClickSoundPath('/ui-sounds/x.exe'), false)
  assert.equal(isValidUiClickSoundPath('/other-dir/x.mp3'), false)
  assert.equal(isValidUiClickSoundPath('data:audio/mpeg;base64,AAAA'), false)
})
