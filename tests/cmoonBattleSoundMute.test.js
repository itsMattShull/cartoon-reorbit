// Source-level guarantees that the solo cMoon battle popup's sound effects and music actually
// respect the Settings page's "Mute sounds" preference. Previously they didn't at all — playSound()
// and playRoundSounds() in composables/useCMoonBattlePopup.js had no mute check whatsoever, and
// components/CMoonBattlePopupHost.vue started battle music unconditionally on entering the FIGHT
// phase — so toggling "Mute sounds" off did nothing for the most common way players fight a cMoon
// enemy (a solo battle popup is offered ambiently on nav; a raid is deliberately joined, and the
// raid page's own battleMusic/playSound calls already did check the preference correctly).
//
// A second gap surfaced after that first fix: even with the gate in place, the preference used to
// only get read from localStorage (hydrate()) once some component remembered to call it in its own
// onMounted — so the very FIRST sound a fresh page load could ever play (an enemy's own appear
// sound, the instant checkOnNavigate's offer reveals) could still race ahead of that correction on
// whichever page happened to mount its hydrate() call later in registration order than its own
// sound-triggering code. plugins/hapticSoundsPref.client.js now hydrates once, before the Vue app
// ever mounts — earlier than any component's setup()/onMounted — closing that race for every
// current and future consumer at once, instead of leaving it to each one to remember.
//
// All three files call Nuxt auto-imported composables (useState, useRoute, defineNuxtPlugin,
// useHapticSoundsPref, etc.) at invocation time, which only resolve inside a real Nuxt app
// context — calling them bare here would throw. So, same as tests/ogGtoonsPackRewardWiring.test.js,
// this reads the files as plain text and asserts against the raw source instead.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const popup = read('composables/useCMoonBattlePopup.js')
const host = read('components/CMoonBattlePopupHost.vue')
const plugin = read('plugins/hapticSoundsPref.client.js')
const pref = read('composables/useHapticSoundsPref.js')
const clickSounds = read('composables/useClickSoundEffects.js')
const raidPage = read('pages/newsite/cmoon-raid/[id].vue')
const settingsPage = read('pages/newsite/settings.vue')

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

test('CMoonBattlePopupHost resolves the same preference and gates battle music on it entering FIGHT', () => {
  assert.match(host, /const \{ enabled: soundsEnabled \} = useHapticSoundsPref\(\)/)
  const fn = host.slice(host.indexOf('const battleMusic = useBattleMusic()'), host.indexOf('onBeforeUnmount'))
  assert.match(fn, /if \(soundsEnabled\.value\) battleMusic\.start\(battle\.value\?\.enemy\?\.faction\?\.battleMusicPath\)/)
})

test('toggling "Mute sounds" mid-fight starts/stops the music immediately, not just on the next phase change', () => {
  const fn = host.slice(host.indexOf('const battleMusic = useBattleMusic()'), host.indexOf('onBeforeUnmount'))
  assert.match(fn, /watch\(soundsEnabled, \(on\) => \{/)
  assert.match(fn, /if \(phase\.value !== 'FIGHT'\) return/)
})

test('a dedicated client plugin hydrates the "Mute sounds" preference once, before the app mounts', () => {
  // The plugin lives at plugins/hapticSoundsPref.client.js — the `.client.js` suffix is Nuxt's
  // own naming convention for "client-only, runs before app.mount()", confirmed by `read()`
  // above having successfully loaded it from exactly that path.
  assert.match(plugin, /export default defineNuxtPlugin\(\(\) => \{/)
  assert.match(plugin, /const \{ hydrate \} = useHapticSoundsPref\(\)/)
  assert.match(plugin, /\n\s*hydrate\(\)\s*\n/)
})

test('no page or composable destructures `hydrate` from useHapticSoundsPref() anymore — the plugin is now the single hydration point', () => {
  for (const [name, src] of [
    ['useCMoonBattlePopup.js', popup],
    ['CMoonBattlePopupHost.vue', host],
    ['useClickSoundEffects.js', clickSounds],
    ["cmoon-raid/[id].vue", raidPage],
    ['settings.vue', settingsPage],
  ]) {
    assert.doesNotMatch(
      src,
      /const \{[^\n}]*\bhydrate\b[^\n}]*\}\s*=\s*useHapticSoundsPref\(\)/,
      `${name} should no longer pull \`hydrate\` out of useHapticSoundsPref()`
    )
  }
})

test("useHapticSoundsPref's own hydrate() still exists and is still what the plugin calls", () => {
  assert.match(pref, /function hydrate\(\)/)
  assert.match(pref, /return \{ enabled, hydrate, setEnabled \}/)
})
