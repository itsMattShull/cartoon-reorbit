// utils/gameRoutePrefixes.js
//
// Routes for pages that already manage their own sound effects and/or involve rapid, repeated
// clicking as core gameplay (paddle/flipper controls, hit/stand spam, card flips, etc.). The
// site-wide click "haptic sound" (composables/useClickSoundEffects.js) skips these entirely —
// stacking a generic blip on top of a game's own audio on every rapid click would be noise at
// best and, on low-end devices, competing audio-context/playback pressure at worst.
export const GAME_ROUTE_PREFIXES = [
  '/newsite/asteroid',
  '/newsite/blackjack',
  '/newsite/edrps',
  '/newsite/flappypowerpuff',
  '/newsite/fruitsamurai',
  '/newsite/guessctoon',
  '/newsite/marbles',
  '/newsite/newwinball',
  '/newsite/pokemonbattle',
  '/newsite/reorbitmatch',
  '/newsite/reorbitmemory',
  '/newsite/spinthewheel',
  '/newsite/tower',
  '/newsite/winball',
  '/newsite/winwheel'
]

export function isGameRoute(path) {
  if (typeof path !== 'string') return false
  // A plain startsWith would also match e.g. '/newsite/winballhistory' against
  // '/newsite/winball', or '/newsite/towerofpower' against '/newsite/tower' — require the
  // prefix to end the path exactly or be followed by '/'.
  return GAME_ROUTE_PREFIXES.some(prefix =>
    path === prefix || path.startsWith(prefix + '/')
  )
}
