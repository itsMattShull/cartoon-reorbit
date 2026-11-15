// composables/useHapticSoundsPref.js
//
// Per-browser on/off switch for the site-wide click sound effect (see
// composables/useClickSoundEffects.js) — and, since settings.vue's "Mute sounds" row now covers
// both, also for cMoon battle sound effects/music, solo (composables/useCMoonBattlePopup.js) and
// raid (pages/newsite/cmoon-raid/[id].vue) alike. Deliberately localStorage-backed rather than an
// account preference (like User.allowAuctionNotifications) — this needs to work for logged-out
// visitors too, since the click sound plays sitewide regardless of auth state, and it's a
// device/session preference (someone may want it off on a shared kiosk, on at home) rather than
// something tied to an account. Stays phrased as "enabled" (sound ON) rather than "muted" even
// though the settings row built on top of it is named the other way around — this composable has
// no opinion on what any one caller calls its own toggle.
//
// hydrate() is called exactly once, by plugins/hapticSoundsPref.client.js, before the app ever
// mounts — not by any individual page/component. A plugin runs earlier than every consumer's own
// setup()/onMounted(), so this is the one hydration call every future sound-playing feature
// automatically inherits for free, rather than each one having to remember its own (a past
// version of this file left that to each caller, and the solo cMoon battle popup's very first
// "an enemy appears!" sound went years without anyone adding it).
const STORAGE_KEY = 'cr_haptic_sounds_enabled_v1'

export function useHapticSoundsPref() {
  // Default true so SSR assumes sound-on; hydrate() corrects it from localStorage before the app
  // mounts (see plugins/hapticSoundsPref.client.js). pages/newsite/settings.vue's own checkbox
  // binds `:checked` to the inverse of this ref — correcting pre-mount rather than on-mount (the
  // "SSR renders a default, client corrects on mount" shape composables/useIsNarrow.js uses)
  // doesn't risk a hydration mismatch there either: Vue always re-applies an <input>'s `checked`
  // DOM property during hydration regardless of what the server sent (the same allowance that
  // lets a browser's own autofill survive hydration unflagged), so the checkbox just renders
  // correctly on the very first paint instead of flashing "on" for a frame before correcting.
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
