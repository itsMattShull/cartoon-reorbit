// utils/gameRoutePrefixes.js
//
// Routes for pages that already manage their own sound effects and/or involve rapid, repeated
// clicking as core gameplay (paddle/flipper controls, hit/stand spam, card flips, etc.). The
// site-wide click "haptic sound" (composables/useClickSoundEffects.js) skips these entirely —
// stacking a generic blip on top of a game's own audio on every rapid click would be noise at
// best and, on low-end devices, competing audio-context/playback pressure at worst.
export const GAME_ROUTE_PREFIXES = [
  '/asteroid',
  '/blackjack',
  '/edrps',
  '/flappypowerpuff',
  '/fruitsamurai',
  '/guessctoon',
  '/marbles',
  '/newwinball',
  '/pokemonbattle',
  '/reorbitmatch',
  '/reorbitmemory',
  '/spinthewheel',
  '/tower',
  '/winball',
  '/winwheel'
]

export function isGameRoute(path) {
  if (typeof path !== 'string') return false
  // A plain startsWith would also match e.g. '/winballhistory' against
  // '/winball', or '/towerofpower' against '/tower' — require the
  // prefix to end the path exactly or be followed by '/'.
  return GAME_ROUTE_PREFIXES.some(prefix =>
    path === prefix || path.startsWith(prefix + '/')
  )
}
