// utils/ogGtoonReveal.js
// Shared (client + server) timing for the one-card-at-a-time reveal of Original gToons.
// The server sends an ordered list of reveal `steps` (player 1's slot-1 card, player 2's slot-1 card,
// player 1's slot-2 card, ...), each carrying the resolved board AFTER that card landed. The client
// plays them back with these timings, and the server pushes the next phase's deadline out by the same
// amount so nobody loses clock time to the animation.

export const REVEAL_FIRST_MS = 600     // pause before the first card flips
export const REVEAL_CARD_MS = 700      // a freshly flipped card is shown with its printed value
export const REVEAL_EFFECTS_MS = 900   // then its effects land: values, colors, KOs and scores update
export const REVEAL_QUIET_MS = 300     // ...or a short beat when nothing else changed

export function revealStepMs(step) {
  return REVEAL_CARD_MS + (step && step.changed ? REVEAL_EFFECTS_MS : REVEAL_QUIET_MS)
}

export function revealDurationMs(steps) {
  if (!Array.isArray(steps) || !steps.length) return 0
  return REVEAL_FIRST_MS + steps.reduce((sum, s) => sum + revealStepMs(s), 0)
}
