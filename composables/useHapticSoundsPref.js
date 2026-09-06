// composables/useHapticSoundsPref.js
//
// Per-browser on/off switch for the site-wide "Haptic Sounds" click effect (see
// composables/useClickSoundEffects.js). Deliberately localStorage-backed rather than an
// account preference (like User.allowAuctionNotifications) — this needs to work for
// logged-out visitors too, since the click sound plays sitewide regardless of auth state, and
// it's a device/session preference (someone may want it off on a shared kiosk, on at home)
// rather than something tied to an account.
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
