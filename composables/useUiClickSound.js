// composables/useUiClickSound.js
//
// Fetches the site-wide UI click "haptic sound" path once per app load. Mirrors
// composables/useSecondEditionOverlay.js's shape: a useState-backed value plus a
// module-scoped shared load promise, so every caller (in practice just
// composables/useClickSoundEffects.js, called once from the root layout) awaits one in-flight
// request instead of firing its own.
export const DEFAULT_CLICK_SOUND_PATH = '/ui-sounds/click-default.mp3'

let loadPromise = null

export function useUiClickSound() {
  const soundPath = useState('uiClickSoundPath', () => ({
    path: DEFAULT_CLICK_SOUND_PATH,
    loaded: false
  }))

  async function ensureLoaded() {
    if (soundPath.value.loaded) return
    if (!loadPromise) {
      loadPromise = $fetch('/api/global-config')
        .then(cfg => {
          soundPath.value = {
            path: cfg?.uiClickSoundPath || DEFAULT_CLICK_SOUND_PATH,
            loaded: true
          }
        })
        .catch(() => {
          soundPath.value = { path: DEFAULT_CLICK_SOUND_PATH, loaded: true }
        })
    }
    await loadPromise
  }

  return { soundPath, ensureLoaded }
}
