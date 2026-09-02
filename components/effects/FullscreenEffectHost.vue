<template>
  <Teleport to="body">
    <div v-if="active" class="fxh-overlay">
      <span class="fxh-sr-status" role="status" aria-live="polite">{{ statusText }}</span>

      <div v-if="reducedMotion" class="fxh-reduced" :class="`fxh-reduced-${type}`"></div>
      <component :is="effectComponent" v-else-if="effectComponent" :duration-ms="durationMs" @done="finish" />
    </div>
  </Teleport>
</template>

<script setup>
// Global host for the reusable full-screen cMoon effects. Mounted once, outside
// `.site-container` (see layouts/newsite-template.vue — that container is a `transform: scale()`
// stacking/containing-block context on desktop, which would trap a `position: fixed` overlay
// inside it; CMoonSelectModal and Onboarding are placed outside it for the same reason).
const { active, type, finish } = useFullscreenEffect()

// Each effect owns its own runtime — capped well under ~3.2s so a longer effect never reads as
// the app "hanging" (the cMoon-select flow only navigates once the effect's onComplete fires —
// see CMoonSelectModal.vue/MyAchievements.vue — so this duration is real end-to-end latency, not
// just a visual budget; see performance/mobile review).
const EFFECT_DURATIONS = {
  GLITCH: 2600,
  SLIME: 2600,
  SLIME_FLOOD: 2800,
  TEXT_CALLOUT: 3000,
  FIREWORKS: 2800,
  FROG: 2800,
  SNAKE: 3200,
}
const DEFAULT_DURATION_MS = 2600
const durationMs = computed(() => EFFECT_DURATIONS[type.value] ?? DEFAULT_DURATION_MS)

const EFFECT_COMPONENTS = {
  // Lazy-loaded: most page loads never trigger an effect, so this code shouldn't ship in the
  // shared layout chunk that loads on every page (see performance review).
  GLITCH: defineAsyncComponent(() => import('./GlitchEffect.vue')),
  SLIME: defineAsyncComponent(() => import('./SlimeEffect.vue')),
  SLIME_FLOOD: defineAsyncComponent(() => import('./SlimeFloodEffect.vue')),
  SNAKE: defineAsyncComponent(() => import('./SnakeEffect.vue')),
  TEXT_CALLOUT: defineAsyncComponent(() => import('./TextCalloutEffect.vue')),
  FROG: defineAsyncComponent(() => import('./FrogEffect.vue')),
  FIREWORKS: defineAsyncComponent(() => import('./FireworksEffect.vue')),
}
const effectComponent = computed(() => (type.value ? EFFECT_COMPONENTS[type.value] : null))

// Object lookup rather than a chain of ternaries — a missed branch there used to silently
// mislabel every unhandled type as "Glitch" (see integration review).
const EFFECT_STATUS_TEXT = {
  GLITCH: 'Glitch effect playing',
  SLIME: 'Slime effect playing',
  SLIME_FLOOD: 'Slime flood effect playing',
  SNAKE: 'Snake effect playing',
  TEXT_CALLOUT: 'Callout effect playing',
  FROG: 'Frog effect playing',
  FIREWORKS: 'Fireworks effect playing',
}
const statusText = computed(() => {
  if (!active.value) return ''
  return EFFECT_STATUS_TEXT[type.value] || 'Effect playing'
})

const reducedMotion = ref(false)
let mql = null
let reducedTimer = null
let prevOverflow = null
let prevActiveEl = null

function applyReducedMotion(e) {
  reducedMotion.value = e.matches
}

watch(active, (isActive) => {
  if (typeof document === 'undefined') return

  if (isActive) {
    // Blur any focused input before locking the page — otherwise a mobile on-screen keyboard
    // can stay open and overlap the full-screen overlay (see mobile/UX review).
    prevActiveEl = document.activeElement
    if (prevActiveEl instanceof HTMLElement) prevActiveEl.blur()

    // Store/restore the exact prior inline value rather than hard-coding 'auto'/'' on the way
    // out — CMoonSelectModal also locks `documentElement.style.overflow`, and closing that modal
    // before this effect starts should already have cleared its own lock, but restoring exactly
    // what was there (not assuming empty) avoids clobbering it if that ever changes.
    prevOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'

    if (reducedMotion.value) {
      reducedTimer = setTimeout(finish, 400)
    }
  } else {
    document.documentElement.style.overflow = prevOverflow ?? ''
    prevOverflow = null
    if (reducedTimer) { clearTimeout(reducedTimer); reducedTimer = null }
  }
})

onMounted(() => {
  mql = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion.value = mql.matches
  mql.addEventListener('change', applyReducedMotion)
})

onBeforeUnmount(() => {
  mql?.removeEventListener('change', applyReducedMotion)
  if (reducedTimer) clearTimeout(reducedTimer)
  if (typeof document !== 'undefined' && prevOverflow !== null) {
    document.documentElement.style.overflow = prevOverflow
  }
})
</script>

<style scoped>
.fxh-overlay {
  position: fixed;
  inset: 0;
  /* 100dvh accounts for mobile browser chrome collapsing during the animation; 100vh is the
     fallback for engines without dvh support (see mobile/UX review). */
  height: 100vh;
  height: 100dvh;
  /* Safely above every other overlay found in the app (cZone glitch: 9990/9999,
     CMoonSelectModal/achievement modal: 1000-2000). */
  z-index: 10000;
  overflow: hidden;
  pointer-events: auto;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
  box-sizing: border-box;
  background: #000;
}

.fxh-sr-status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.fxh-reduced {
  position: absolute;
  inset: 0;
  animation: fxh-reduced-fade 0.4s ease-out forwards;
}
.fxh-reduced-GLITCH { background: #1a1a1a; }
.fxh-reduced-SLIME { background: #4caf00; }
.fxh-reduced-SLIME_FLOOD { background: #ff8c00; }
.fxh-reduced-SNAKE { background: #b31217; }
.fxh-reduced-TEXT_CALLOUT { background: #ffd400; }
.fxh-reduced-FROG { background: #6a1fb0; }
.fxh-reduced-FIREWORKS { background: #0d47a1; }

@keyframes fxh-reduced-fade {
  0%   { opacity: 0; }
  30%  { opacity: 1; }
  100% { opacity: 0; }
}
</style>
