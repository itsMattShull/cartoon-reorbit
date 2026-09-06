// composables/useUiClickSound.js
//
// Fetches the site-wide UI click "haptic sound" config once per app load — the default sound
// plus any per-nav-button overrides (see utils/navSoundSlots.js). Mirrors
// composables/useSecondEditionOverlay.js's shape: a useState-backed value plus a module-scoped
// shared load promise, so every caller (in practice just
// composables/useClickSoundEffects.js, called once from the root layout) awaits one in-flight
// request instead of firing its own.
export const DEFAULT_CLICK_SOUND_PATH = '/ui-sounds/click-default.mp3'

let loadPromise = null

export function useUiClickSound() {
  const soundConfig = useState('uiClickSoundConfig', () => ({
    defaultPath: DEFAULT_CLICK_SOUND_PATH,
    navSounds: {},
    loaded: false
  }))

  async function ensureLoaded() {
    if (soundConfig.value.loaded) return
    if (!loadPromise) {
      loadPromise = $fetch('/api/global-config')
        .then(cfg => {
          soundConfig.value = {
            defaultPath: cfg?.uiClickSoundPath || DEFAULT_CLICK_SOUND_PATH,
            navSounds: (cfg?.uiNavButtonSounds && typeof cfg.uiNavButtonSounds === 'object') ? cfg.uiNavButtonSounds : {},
            loaded: true
          }
        })
        .catch(() => {
          soundConfig.value = { defaultPath: DEFAULT_CLICK_SOUND_PATH, navSounds: {}, loaded: true }
        })
    }
    await loadPromise
  }

  return { soundConfig, ensureLoaded }
}
