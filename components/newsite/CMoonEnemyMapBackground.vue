<template>
  <!-- Same Teleport-to-body reason as every modal in this app (CMoonRaidBattleReportModal, etc.)
       — .site-container gets transform:scale() in some states, which would make a plain
       position:fixed descendant track THAT box instead of the true viewport. -->
  <Teleport to="body">
    <div
      class="cemb-root" :class="`cemb-${animation.toLowerCase()}`"
      :style="{ '--cemb-color': color }"
    >
      <template v-if="animation === 'GLOW'">
        <div class="cemb-glow-pulse"></div>
      </template>
      <template v-else-if="animation === 'SMOKE'">
        <div class="cemb-smoke-blob cemb-smoke-a"></div>
        <div class="cemb-smoke-blob cemb-smoke-b"></div>
        <div class="cemb-smoke-blob cemb-smoke-c"></div>
      </template>
      <template v-else-if="animation === 'GLITTER'">
        <div v-for="n in 18" :key="n" class="cemb-glitter-dot" :style="glitterStyle(n)"></div>
      </template>
      <!-- STATIC_COLOR: just the flat --cemb-color wash from .cemb-static-color below, no extra markup -->
    </div>
  </Teleport>
</template>

<script setup>
// A battle-long animated backdrop behind a raid/PvP fight — see CMoonEnemyMap's own schema
// comment for the 4 animation types an admin can pick. Deliberately CSS-only (no canvas, no
// per-frame JS) to stay cheap on a page that's already doing round-by-round socket updates.
// Mounted as a fixed full-viewport layer BEHIND the existing battle card — see this component's
// own host pages (cmoon-raid/[id].vue, cmoon-pvp/[id].vue) for the exact z-index/pointer-events
// wrapper, since neither page had any full-screen background layer before this existed.
const props = defineProps({
  animation: { type: String, default: 'STATIC_COLOR' }, // GLOW | SMOKE | GLITTER | STATIC_COLOR
  color: { type: String, default: '#000000' },
})

// Deterministic-enough scatter for a handful of glitter dots — no need for true randomness here,
// just visual variety; recomputing per-render would be wasteful so this is driven off the dot's
// own index instead of Math.random().
function glitterStyle(n) {
  const left = (n * 37) % 100
  const top = (n * 53) % 100
  const delay = (n % 6) * 0.4
  const duration = 2.2 + (n % 5) * 0.3
  return {
    left: `${left}%`, top: `${top}%`,
    animationDelay: `${delay}s`, animationDuration: `${duration}s`,
  }
}
</script>

<style scoped>
.cemb-root {
  position: fixed;
  inset: 0;
  /* Negative, not 0 — guarantees this paints BELOW the page's own normal-flow content (which
     has no z-index of its own) regardless of DOM order, without requiring every host page to
     explicitly declare a z-index/position just to stack above a background it may not even
     know exists. */
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
}

/* STATIC_COLOR — the simplest case, also what the seeded "No Effect" base map uses (at
   #000000, i.e. invisible) — just a flat wash, no animation at all. */
.cemb-static_color {
  background: var(--cemb-color);
  opacity: 0.08;
}

/* GLOW — a slow-pulsing radial vignette, closest in spirit to CMoonJoinEffect's own
   vignette option (components/effects/*.vue's radial-gradient backgrounds). */
.cemb-glow {
  background: radial-gradient(circle at 50% 45%, transparent 0%, var(--cemb-color) 100%);
  opacity: 0.18;
}
.cemb-glow-pulse {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 45%, var(--cemb-color) 0%, transparent 65%);
  animation: cemb-pulse 4s ease-in-out infinite;
}
@keyframes cemb-pulse {
  0%, 100% { opacity: 0.15; }
  50% { opacity: 0.35; }
}

/* SMOKE — a few large, heavily blurred blobs drifting slowly across the screen. */
.cemb-smoke {
  opacity: 0.22;
}
.cemb-smoke-blob {
  position: absolute;
  width: 60vmax;
  height: 60vmax;
  border-radius: 50%;
  background: var(--cemb-color);
  filter: blur(60px);
  animation: cemb-drift 22s ease-in-out infinite;
}
.cemb-smoke-a { top: -20%; left: -15%; animation-duration: 26s; }
.cemb-smoke-b { top: 30%; left: 50%; animation-duration: 20s; animation-delay: -6s; }
.cemb-smoke-c { top: 60%; left: -10%; animation-duration: 24s; animation-delay: -12s; }
@keyframes cemb-drift {
  0%   { transform: translate(0, 0) scale(1); }
  50%  { transform: translate(8vw, 6vh) scale(1.1); }
  100% { transform: translate(0, 0) scale(1); }
}

/* GLITTER — a sparse layer of small animated points, each on its own twinkle timer. */
.cemb-glitter {
  opacity: 0.5;
}
.cemb-glitter-dot {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--cemb-color);
  box-shadow: 0 0 6px 1px var(--cemb-color);
  animation: cemb-twinkle 3s ease-in-out infinite;
}
@keyframes cemb-twinkle {
  0%, 100% { opacity: 0.15; transform: scale(0.8); }
  50% { opacity: 0.9; transform: scale(1.3); }
}

@media (prefers-reduced-motion: reduce) {
  .cemb-glow-pulse, .cemb-smoke-blob, .cemb-glitter-dot {
    animation: none;
  }
}
</style>
