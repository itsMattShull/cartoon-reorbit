// Source-level guarantees that the solo cMoon battle popup's sound effects and music actually
// respect the Settings page's "Mute sounds" preference. Previously they didn't at all — playSound()
// and playRoundSounds() in composables/useCMoonBattlePopup.js had no mute check whatsoever, and
// components/CMoonBattlePopupHost.vue started battle music unconditionally on entering the FIGHT
// phase — so toggling "Mute sounds" off did nothing for the most common way players fight a cMoon
// enemy (a solo battle popup is offered ambiently on nav; a raid is deliberately joined, and the
// raid page's own battleMusic/playSound calls already did check the preference correctly).
//
// Both files call Nuxt auto-imported composables (useState, useRoute, useHapticSoundsPref, etc.)
// at invocation time, which only resolve inside a real Nuxt app context — calling them bare here
// would throw. So, same as tests/ogGtoonsPackRewardWiring.test.js, this reads the files as plain
// text and asserts against the raw source instead.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const popup = read('composables/useCMoonBattlePopup.js')
const host = read('components/CMoonBattlePopupHost.vue')

test('useCMoonBattlePopup resolves the shared "Mute sounds" preference once, inside its own setup-context body', () => {
  assert.match(popup, /const \{ enabled: soundsEnabled \} = useHapticSoundsPref\(\)/)
})

test('playSound never plays unless soundsEnabled is true', () => {
  const fn = popup.slice(popup.indexOf('function playSound('), popup.indexOf('const RESULT_STINGER'))
  assert.match(fn, /function playSound\(path, soundsEnabled\)/)
  assert.match(fn, /if \(!path \|\| !soundsEnabled\?\.value \|\| typeof window === 'undefined'\) return/)
})

test('playRoundSounds and every playSound call site thread soundsEnabled through, not just some of them', () => {
  assert.match(popup, /function playRoundSounds\(round, enemy, soundsEnabled\)/)
  // Every playSound( call in the file must end with ", soundsEnabled)" right before its closing
  // paren (the two internal ones inside playSound/playRoundSounds' own definitions aside, which
  // this same pattern also matches since they're `playSound(x, soundsEnabled)` calls too).
  const calls = popup.match(/playSound\([^)]*\)/g) || []
  assert.ok(calls.length >= 9, `expected at least 9 playSound( call sites, found ${calls.length}`)
  const unguarded = calls.filter(c => !/soundsEnabled\)$/.test(c) && !c.startsWith('function playSound('))
  assert.deepEqual(unguarded, [], 'every playSound( call site must pass soundsEnabled through')
})

test('CMoonBattlePopupHost hydrates the same preference and gates battle music on it entering FIGHT', () => {
  assert.match(host, /const \{ enabled: soundsEnabled, hydrate: hydrateSoundsPref \} = useHapticSoundsPref\(\)/)
  assert.match(host, /onMounted\(\(\) => \{ hydrateSoundsPref\(\) \}\)/)
  const fn = host.slice(host.indexOf('const battleMusic = useBattleMusic()'), host.indexOf('onBeforeUnmount'))
  assert.match(fn, /if \(soundsEnabled\.value\) battleMusic\.start\(battle\.value\?\.enemy\?\.faction\?\.battleMusicPath\)/)
})

test('toggling "Mute sounds" mid-fight starts/stops the music immediately, not just on the next phase change', () => {
  const fn = host.slice(host.indexOf('const battleMusic = useBattleMusic()'), host.indexOf('onBeforeUnmount'))
  assert.match(fn, /watch\(soundsEnabled, \(on\) => \{/)
  assert.match(fn, /if \(phase\.value !== 'FIGHT'\) return/)
})
