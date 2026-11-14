// plugins/hapticSoundsPref.client.js
//
// Reads the Settings page's "Mute sounds" preference (composables/useHapticSoundsPref.js) from
// localStorage ONCE, as early as physically possible on the client — a Nuxt plugin runs before
// the Vue app is mounted, i.e. before any page or layout component's own setup()/onMounted() ever
// runs. That's the guarantee this preference actually needs: `useState`'s shared ref always
// starts at its SSR-safe default (sound ON) and only reads the real, possibly-muted value once
// something calls hydrate() — so whichever audio-playing code path happens to run first on a
// given page was, until now, only ever "fixed" by that one call site remembering to hydrate
// before it (pages/newsite/cmoon-raid/[id].vue did; composables/useCMoonBattlePopup.js's solo
// battle popup didn't, which is exactly how the "mute doesn't work" bug happened in the first
// place — and remained a standing risk for the very first thing a visit to the site can play, an
// enemy's own appear sound the instant a cMoon encounter offer shows up). Hydrating once here,
// before mount, removes the need for every future sound-playing feature to remember this step at
// all — the preference is simply already correct by the time anything can act on it.
export default defineNuxtPlugin(() => {
  const { hydrate } = useHapticSoundsPref()
  hydrate()
})
