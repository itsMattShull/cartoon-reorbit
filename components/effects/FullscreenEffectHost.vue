<template>
  <Teleport to="body">
    <Transition name="fxh-exit">
      <div v-if="active" class="fxh-overlay" :style="overlayStyle">
        <span class="fxh-sr-status" role="status" aria-live="polite">{{ statusText }}</span>

        <div v-if="reducedMotion" class="fxh-reduced" :class="reducedClass" :style="reducedStyle"></div>
        <component
          :is="effectComponent"
          v-else-if="effectComponent && !contentDone"
          :duration-ms="durationMs"
          :config="isCustom ? effect.config : undefined"
          @done="handleDone"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
// Global host for the reusable full-screen cMoon effects. Mounted once, outside
// `.site-container` (see layouts/newsite-template.vue — that container is a `transform: scale()`
// stacking/containing-block context on desktop, which would trap a `position: fixed` overlay
// inside it; CMoonSelectModal and Onboarding are placed outside it for the same reason).
const { active, effect, finish } = useFullscreenEffect()

const type = computed(() => effect.value?.type || null)
const isCustom = computed(() => type.value === 'CUSTOM')

// Each built-in effect owns its own runtime — capped well under ~3.2s so a longer effect never
// reads as the app "hanging" (the cMoon-select flow only navigates once the effect's onComplete
// fires — see CMoonSelectModal.vue/MyAchievements.vue — so this duration is real end-to-end
// latency, not just a visual budget). The custom template (CustomJoinEffect.vue) always runs a
// single fixed duration since, unlike the bespoke built-ins, it has no per-instance timeline of
// its own to size a duration around.
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
const CUSTOM_DURATION_MS = 2400
const durationMs = computed(() => (isCustom.value ? CUSTOM_DURATION_MS : (EFFECT_DURATIONS[type.value] ?? DEFAULT_DURATION_MS)))

const EFFECT_COMPONENTS = {
  // Lazy-loaded: most page loads never trigger an effect, so this code shouldn't ship in the
  // shared layout chunk that loads on every page.
  GLITCH: defineAsyncComponent(() => import('./GlitchEffect.vue')),
  SLIME: defineAsyncComponent(() => import('./SlimeEffect.vue')),
  SLIME_FLOOD: defineAsyncComponent(() => import('./SlimeFloodEffect.vue')),
  SNAKE: defineAsyncComponent(() => import('./SnakeEffect.vue')),
  TEXT_CALLOUT: defineAsyncComponent(() => import('./TextCalloutEffect.vue')),
  FROG: defineAsyncComponent(() => import('./FrogEffect.vue')),
  FIREWORKS: defineAsyncComponent(() => import('./FireworksEffect.vue')),
}
// Same lazy-loading discipline as the 7 built-ins above — admin-authored effects are no more
// common than any single built-in, so this shouldn't ship in the shared chunk either.
const CUSTOM_COMPONENT = defineAsyncComponent(() => import('./CustomJoinEffect.vue'))

const effectComponent = computed(() => {
  if (isCustom.value) return CUSTOM_COMPONENT
  return type.value ? EFFECT_COMPONENTS[type.value] : null
})

// Object lookup rather than a chain of ternaries — a missed branch there used to silently
// mislabel every unhandled type as "Glitch".
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
  if (isCustom.value) return 'Join effect playing'
  return EFFECT_STATUS_TEXT[type.value] || 'Effect playing'
})

// A custom effect's own background color needs to keep showing on the outer overlay div once its
// inner component unmounts (see contentDone below) so the exit fade is a continuation of what was
// already on screen, not a jarring cut back to black first. Bound via Vue's object-syntax `:style`
// (never a concatenated string) — the value is validated hex server-side, but this is the same
// belt-and-braces pattern used everywhere else a cMoon color reaches a `:style` binding (see
// utils/cmoonColor.js).
const overlayStyle = computed(() => {
  if (isCustom.value && effect.value?.config?.backgroundColor) {
    return { background: effect.value.config.backgroundColor }
  }
  return {}
})

// True the instant the inner effect's own content is done — stops rendering it immediately
// (Vue's normal unmount lifecycle cancels any rAF loop or in-progress GIF decode right then,
// see e.g. FireworksEffect.vue/SnakeEffect.vue's onBeforeUnmount) rather than leaving it mounted
// and running for the full exit-fade duration below. The exit fade itself only needs the flat
// background color that overlayStyle/`.fxh-overlay`'s own CSS already provides, so nothing
// visible is lost by unmounting the (expensive) content at this exact moment.
const contentDone = ref(false)

function handleDone() {
  contentDone.value = true
  finish()
}

const reducedMotion = ref(false)
let mql = null
let reducedTimer = null
let prevOverflow = null
let prevActiveEl = null

function applyReducedMotion(e) {
  reducedMotion.value = e.matches
}

const reducedClass = computed(() => (!isCustom.value && type.value ? `fxh-reduced-${type.value}` : null))
const reducedStyle = computed(() => {
  if (isCustom.value && effect.value?.config?.backgroundColor) {
    return { background: effect.value.config.backgroundColor }
  }
  return {}
})

watch(active, (isActive) => {
  if (typeof document === 'undefined') return

  if (isActive) {
    contentDone.value = false

    // Blur any focused input before locking the page — otherwise a mobile on-screen keyboard
    // can stay open and overlap the full-screen overlay.
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
     fallback for engines without dvh support. */
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

/* Fades the whole overlay into the destination page on the way out instead of vanishing in one
   frame — the route/reveal underneath (see useFullscreenEffect.js#finish) starts mounting the
   instant this begins, so what's visible is a real cross-fade, not a fade-to-black-then-pause.
   No enter transition is defined on purpose: effects should still start showing immediately. */
.fxh-exit-leave-active {
  transition: opacity 420ms ease;
}
.fxh-exit-leave-to {
  opacity: 0;
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
