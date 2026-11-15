<template>
  <div class="cpt-root" :class="captured ? 'cpt-captured' : 'cpt-broke-free'" aria-hidden="true">
    <div class="cpt-ball">
      <span class="cpt-button"></span>
    </div>
  </div>
</template>

<script setup>
// A white/red Pokeball thrown from the player's side at the enemy portrait when a "Throw
// Pokeball" special attack (CMoonSpecialAttackEffectType.CATCH_ATTEMPT) fires — see
// CMoonBattlePopupHost.vue's own watch(lastRound, ...) for when this gets mounted/keyed to
// re-trigger. Purely presentational: the parent decides WHEN to show this (mounting it with a
// fresh :key restarts the animation) and WHETHER it ends in a capture, via the one `captured`
// prop — no internal timers, the two outcomes are just two different CSS animations that run
// once on mount. Meant to be slotted into CMoonBattleCard's `portrait-badge` slot, which already
// renders inside `.cbc-portrait-wrap` (position: relative) — this is absolutely positioned
// against that same box, so "lands on/replaces the portrait" falls out of that shared anchor for
// free, no coordinate math needed.
defineProps({
  // true: the ball settles directly over the portrait and STAYS (the parent never unmounts this
  // case — it persists through the RESULT screen too). false: the ball bounces once then rolls
  // off and fades — the parent unmounts this after the animation finishes.
  captured: { type: Boolean, default: false },
})
</script>

<style scoped>
.cpt-root {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.cpt-ball {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background:
    linear-gradient(to bottom, #e5e7eb 52%, transparent 52%),
    linear-gradient(to bottom, #dc2626 0%, #dc2626 48%, #111827 48%, #111827 52%, #fff 52%, #fff 100%);
  border: 2px solid #111827;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
  opacity: 0;
}
.cpt-button {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #111827;
}

/* Captured: the ball grows to cover most of the enemy portrait wrap it's slotted into (see this
   component's own header comment on that shared anchor) — "replaces the sprite," not just a
   small badge floating in front of it. Broke free: stays a small ball throughout its escape/
   roll-away dance, since it never needs to visually stand in for the enemy. */
.cpt-captured .cpt-ball { width: 76px; height: 76px; }
.cpt-captured .cpt-button { width: 20px; height: 20px; margin: -10px 0 0 -10px; }

.cpt-captured .cpt-ball { animation: cpt-settle 0.6s ease-out forwards; }
.cpt-broke-free .cpt-ball { animation: cpt-escape 1.4s ease-in forwards; }

@keyframes cpt-settle {
  0%   { transform: translateX(-70px) rotate(0deg) scale(0.9); opacity: 0; }
  60%  { transform: translateX(6px) rotate(620deg) scale(1.05); opacity: 1; }
  100% { transform: translateX(0) rotate(720deg) scale(1); opacity: 1; }
}
@keyframes cpt-escape {
  0%   { transform: translateX(-70px) rotate(0deg); opacity: 0; }
  35%  { transform: translateX(0) rotate(480deg); opacity: 1; }
  /* A couple of little shakes at the landing spot — "it's trying to break free" — before it does. */
  45%  { transform: translateX(-4px) rotate(480deg); }
  55%  { transform: translateX(4px) rotate(480deg); }
  65%  { transform: translateX(-4px) rotate(480deg); opacity: 1; }
  85%  { transform: translateX(80px) rotate(900deg); opacity: 0.4; }
  100% { transform: translateX(110px) rotate(1080deg); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .cpt-captured .cpt-ball { animation: none; transform: none; opacity: 1; }
  .cpt-broke-free .cpt-ball { animation: none; transform: none; opacity: 0; }
}
</style>
