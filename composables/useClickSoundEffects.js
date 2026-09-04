// composables/useClickSoundEffects.js
//
// Site-wide "haptic sound" click effect, recreating the classic Cartoon Orbit button blip —
// including per-nav-button sound overrides (utils/navSoundSlots.js), admin-assigned from
// Manage Homepage > Sounds. Installed once from layouts/newsite-template.vue's onMounted — NOT
// a Nuxt plugin, since nothing here needs plugin-level init; a composable called from the root
// layout is the existing idiom for "one global thing, set up once" in this codebase (see
// composables/useSecondEditionOverlay.js).
//
// Deliberately a single delegated `click` listener on `document` rather than touching any of
// the ~1600 individual <button> elements across the app: cheap (one listener, not thousands),
// and works retroactively on every button anywhere without per-component changes. A clicked
// element is mapped to a nav slot by walking up to the nearest `data-nav-sound="<slotKey>"`
// ancestor (set on the NuxtLink wrapping each main-nav button in NavLeft.vue/NavRight.vue);
// anything without one just plays the site-wide default.
//
// Playback uses the Web Audio API (AudioContext + decodeAudioData + BufferSource), mirroring
// the existing pattern in pages/newsite/newwinball.vue, rather than a pool of HTMLAudioElements
// — a decoded AudioBuffer can be started many times concurrently with no pooling, no "reset
// currentTime" dance, and no HTMLAudioElement-count ceiling on rapid repeat clicks. Buffers are
// cached per resolved sound path (a handful of short clips at most — one per nav slot plus the
// default — trivial memory once decoded), not just one global buffer, since different slots can
// point at different sounds.
//
// The AudioContext and every decode are deferred until the FIRST qualifying click of each
// distinct sound, not created/fetched eagerly on mount: creating the context earlier risks it
// landing before any user gesture (autoplay-policy-suspended with nothing to resume it later)
// for zero benefit, since nothing plays before a click anyway. The trade-off is that the first
// click that resolves to a given sound plays nothing (it only kicks off the decode); every click
// after that on the same sound is instant.
import { isGameRoute } from '@/utils/gameRoutePrefixes'
import { useUiClickSound } from '@/composables/useUiClickSound'
import { useHapticSoundsPref } from '@/composables/useHapticSoundsPref'

// Floor on time between plays, regardless of how fast clicks arrive. This is defense in depth,
// not the primary control — MAX_DURATION_SECONDS in the upload endpoint is what actually keeps
// any single play short — but it also means a script or a stuck key firing synthetic clicks in
// a tight loop can't turn this into a continuous tone.
const MIN_REPLAY_INTERVAL_MS = 50

// Playback volume is fixed here rather than trusting the uploaded file's own mastered loudness
// — an admin-replaceable, sitewide, every-click sound should never be able to get louder than
// this regardless of what gets uploaded.
const PLAYBACK_GAIN = 0.5

const CLICKABLE_SELECTOR = 'button:not(:disabled), [role="button"]:not([aria-disabled="true"])'

let installed = false
let audioCtx = null
let gainNode = null
const audioBuffers = new Map()   // resolved sound path -> decoded AudioBuffer
const decodePromises = new Map() // resolved sound path -> in-flight decode promise
let lastPlayedAt = 0

function isTouchCapable() {
  return typeof window !== 'undefined' &&
    (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)
}

async function ensureAudioReady(soundPath) {
  if (typeof window === 'undefined') return null
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) return null

  if (!audioCtx) {
    audioCtx = new AudioContextCtor()
    gainNode = audioCtx.createGain()
    gainNode.gain.value = PLAYBACK_GAIN
    gainNode.connect(audioCtx.destination)
  }
  if (audioCtx.state === 'suspended') {
    try { await audioCtx.resume() } catch {}
  }
  if (!audioBuffers.has(soundPath) && !decodePromises.has(soundPath)) {
    const decode = fetch(soundPath)
      .then(res => res.arrayBuffer())
      .then(buf => audioCtx.decodeAudioData(buf))
      .then(decoded => { audioBuffers.set(soundPath, decoded) })
      .catch(() => {})
      .finally(() => { decodePromises.delete(soundPath) })
    decodePromises.set(soundPath, decode)
  }
  await decodePromises.get(soundPath)
  return audioBuffers.get(soundPath)
}

function playBuffer(soundPath) {
  const buffer = audioBuffers.get(soundPath)
  if (!audioCtx || !buffer) return
  try {
    const source = audioCtx.createBufferSource()
    source.buffer = buffer
    source.connect(gainNode)
    source.start(0)
  } catch {}
}

export function useClickSoundEffects() {
  function install() {
    if (installed || typeof document === 'undefined') return
    installed = true

    const route = useRoute()
    const { enabled, hydrate } = useHapticSoundsPref()
    const { soundConfig, ensureLoaded } = useUiClickSound()
    hydrate()
    ensureLoaded()

    document.addEventListener('click', async (event) => {
      if (!enabled.value) return
      // /admin/* (layouts/admin.vue) never mounts this layout, but /newsite/admin/* does
      // (see isAdminRoute in layouts/newsite-template.vue) — exclude both, admin tooling
      // isn't in scope for this effect.
      if (route.path.startsWith('/admin') || route.path.startsWith('/newsite/admin')) return
      if (isGameRoute(route.path)) return

      const target = event.target?.closest?.(CLICKABLE_SELECTOR)
      if (!target) return
      if (target.closest('[data-no-click-sound]')) return

      const now = performance.now()
      if (now - lastPlayedAt < MIN_REPLAY_INTERVAL_MS) return
      lastPlayedAt = now

      if (isTouchCapable()) {
        try { navigator.vibrate?.(10) } catch {}
      }

      await ensureLoaded()
      const navSlot = target.closest('[data-nav-sound]')?.dataset.navSound
      const resolvedPath = (navSlot && soundConfig.value.navSounds[navSlot]) || soundConfig.value.defaultPath

      await ensureAudioReady(resolvedPath)
      playBuffer(resolvedPath)
    }, { passive: true })
  }

  return { install }
}
