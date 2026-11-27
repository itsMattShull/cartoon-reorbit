// composables/useSnowPref.js
//
// Per-browser preference for the December snow effect (components/effects/SnowEffect.vue), backed
// by the same localStorage key utils/snow.js documents (SNOW_PREF_KEY). Same shape and reasoning
// as composables/useHapticSoundsPref.js: localStorage rather than an account setting, because the
// snow shows for logged-out visitors too and is a device preference (people turn visual effects
// off on a slow phone, not on their account).
//
// Shared via useState so flipping the switch on /settings takes effect on the snow instantly — the
// layout that mounts the effect watches this same ref, no reload or navigation needed.
import { SNOW_PREF_KEY, isSnowSeason } from '~/utils/snow'

export function useSnowPref() {
  // null = follow the calendar, 'off' = the visitor turned it off, 'on' = forced on (QA only).
  const pref = useState('snowPref', () => null)
  // Whether snow is "a thing right now" — December, or forced on. The settings row only shows
  // then, so nobody is offered a snow switch in June. Client-decided (see hydrate), hence false
  // during SSR, which keeps server and first-client render identical.
  const relevant = useState('snowRelevant', () => false)

  function hydrate() {
    if (!import.meta.client) return
    let stored = null
    try { stored = localStorage.getItem(SNOW_PREF_KEY) } catch { /* storage blocked: follow the calendar */ }
    pref.value = stored === 'off' || stored === 'on' ? stored : null
    relevant.value = isSnowSeason() || pref.value === 'on'
  }

  // `off === true` → never show snow. `false` clears the override so the calendar decides again
  // (which also retires a leftover QA 'on').
  function setOff(off) {
    pref.value = off ? 'off' : null
    if (!import.meta.client) return
    try {
      if (off) localStorage.setItem(SNOW_PREF_KEY, 'off')
      else localStorage.removeItem(SNOW_PREF_KEY)
    } catch { /* storage blocked: the choice still applies for this page view */ }
  }

  return { pref, relevant, hydrate, setOff }
}
