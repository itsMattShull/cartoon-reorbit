// composables/useHapticSoundsPref.js
//
// Per-browser on/off switch for the site-wide click sound effect (see
// composables/useClickSoundEffects.js) — and, since settings.vue's "Mute sounds" row now covers
// both, also for cMoon raid battle sound effects/music (see pages/newsite/cmoon-raid/[id].vue).
// Deliberately localStorage-backed rather than an account preference (like
// User.allowAuctionNotifications) — this needs to work for logged-out visitors too, since the
// click sound plays sitewide regardless of auth state, and it's a device/session preference
// (someone may want it off on a shared kiosk, on at home) rather than something tied to an
// account. Stays phrased as "enabled" (sound ON) rather than "muted" even though the settings
// row built on top of it is named the other way around — this composable has no opinion on what
// any one caller calls its own toggle.
const STORAGE_KEY = 'cr_haptic_sounds_enabled_v1'

export function useHapticSoundsPref() {
  // Default true so SSR and the very first paint assume sound-on; hydrate() below corrects
  // it from localStorage once we're on the client, same "SSR renders a default, client
  // corrects on mount" shape as composables/useIsNarrow.js.
  const enabled = useState('hapticSoundsEnabled', () => true)

  function hydrate() {
    if (!import.meta.client) return
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored !== null) enabled.value = stored === '1'
    } catch {}
  }

  function setEnabled(value) {
    enabled.value = !!value
    if (import.meta.client) {
      try { localStorage.setItem(STORAGE_KEY, enabled.value ? '1' : '0') } catch {}
    }
  }

  return { enabled, hydrate, setEnabled }
}
