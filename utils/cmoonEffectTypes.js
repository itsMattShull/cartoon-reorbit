// utils/cmoonEffectTypes.js
// Single source of truth for the closed set of cMoon full-screen join-effect types — must stay
// in sync with the `CMoonEffectType` enum in prisma/schema.prisma (tests/cmoonEffectTypes.test.js
// checks this). Both the server-side allow-list (server/utils/cmoon.js) and the client-side
// player (composables/useFullscreenEffect.js) import this same array rather than keeping their
// own copies, so a value added to one can never silently drift from the other.
export const CMOON_EFFECT_TYPES = [
  'GLITCH',
  'SLIME',
  'SLIME_FLOOD',
  'SNAKE',
  'TEXT_CALLOUT',
  'POKEBALL',
  'FIREWORKS',
]
