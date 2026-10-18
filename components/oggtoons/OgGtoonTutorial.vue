<!-- components/oggtoons/OgGtoonTutorial.vue -->
<!-- The guide for the original gToons (2002) tutorial match. Rendered by OgGtoonMatchBoard.vue, on top of
     the live board. The steps live in utils/ogGtoonTutorialSteps.js; the board marks the things they
     point at with `data-tut="name"`.
     ── How it highlights ──────────────────────────────────────────────────────────────────────
     The highlight is on the REAL element, not a shape drawn at measured coordinates: the current step's
     target gets a `data-tut-spot` attribute, and the (unscoped) CSS below gives that attribute an
     outline. So the ring is part of the element and follows it through the site's `transform: scale()`,
     scrolling, resizing and re-renders with nothing to keep in sync.
     The lock works the same way: while a step is showing, `body[data-tut-lock]` turns pointer-events off
     for everything except the guide, and an ACTION step's spot turns them back on for itself and its
     children. So the one thing it points at is the only thing a tap can reach. An INFO step highlights
     without unlocking anything; its button is the way on.
     Only the dimming around the spot and the little arrow are positioned from the element's rect, and
     they are purely cosmetic (they never take a tap), so a pixel of error there cannot break anything.
     The overlay is teleported to <body>: the site chrome is a `transform: scale()` box, and inside one a
     `position: fixed` element is placed against the box (offset, and scrolling with the page) rather
     than the window. -->
<template>
  <Teleport to="body">
    <div v-if="step" class="tut-root" data-tutorial-overlay>
      <!-- Faded out while a reveal plays (no help text then), so the board can be watched unshaded; taps stay locked. -->
      <div class="tut-dim" :class="{ 'tut-dim-hole': !!hole, 'tut-dim-off': !isReady }" :style="dimStyle"></div>
      <div v-if="hole && step.kind === 'action' && isReady" class="tut-arrow" :class="{ 'tut-arrow-up': arrowBelow }" :style="arrowStyle" aria-hidden="true">{{ arrowBelow ? '▲' : '▼' }}</div>

      <!-- While a reveal is animating the shade is off and the guide says nothing; everything stays locked. -->
      <div v-if="isReady" ref="cardEl" class="tut-card" :class="cardSide === 'top' ? 'tut-card-top' : 'tut-card-bottom'" role="dialog" aria-live="polite" :aria-label="step.title">
        <p class="tut-step">Step {{ index + 1 }} of {{ total }}</p>
        <h3 class="tut-title">{{ step.title }}</h3>
        <p class="tut-text">{{ step.text }}</p>
        <div class="tut-foot">
          <button class="tut-exit" @click="$emit('exit')">Exit tutorial</button>
          <button v-if="step.kind === 'info'" class="tut-next" @click="advance">{{ step.button || 'Next' }}</button>
          <span v-else class="tut-hint">{{ spotEl ? 'Tap the highlighted spot' : 'Follow the instruction above' }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { TUTORIAL_STEPS, settleStepIndex } from '@/utils/ogGtoonTutorialSteps'

const props = defineProps({
  // What the board knows right now (see the ctx description in utils/ogGtoonTutorialSteps.js).
  board: { type: Object, required: true }
})
const emit = defineEmits(['exit', 'finish'])

/* ── Which step we are on ────────────────────────────────────────────────────────────────── */
const index = ref(0)
const total = TUTORIAL_STEPS.length
const step = computed(() => TUTORIAL_STEPS[index.value] || null)
const isReady = computed(() => !step.value?.ready || step.value.ready(props.board))

watch(() => props.board, (b) => { index.value = settleStepIndex(TUTORIAL_STEPS, index.value, b) }, { immediate: true })

function advance() {
  if (step.value?.finish) { emit('finish'); return }
  index.value = settleStepIndex(TUTORIAL_STEPS, index.value + 1, props.board)
}

/* ── Marking the target ──────────────────────────────────────────────────────────────────── */
const SPOT = 'data-tut-spot'
const LOCK = 'data-tut-lock'
const spotEl = shallowRef(null)   // the element currently marked
const rect = ref(null)            // its box in window coordinates: { x, y, w, h } (cosmetic use only)
const vw = ref(typeof window === 'undefined' ? 1024 : window.innerWidth)
const vh = ref(typeof window === 'undefined' ? 768 : window.innerHeight)
const cardEl = ref(null)
const cardH = ref(0)
let raf = 0
let scrolledFor = null // the element we last scrolled into view

/** The first on-screen element carrying one of the step's data-tut names. */
function findTarget(target) {
  if (!target || typeof document === 'undefined') return null
  for (const name of Array.isArray(target) ? target : [target]) {
    for (const el of document.querySelectorAll(`[data-tut="${name}"]`)) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) return el
    }
  }
  return null
}

/** Sets or clears a boolean attribute, touching the DOM only when it actually changes. */
function flag(el, name, on) {
  if (on !== el.hasAttribute(name)) { if (on) el.setAttribute(name, ''); else el.removeAttribute(name) }
}

function unmark() {
  if (spotEl.value) {
    spotEl.value.removeAttribute(SPOT)
    spotEl.value.removeAttribute('data-tut-big')
  }
  spotEl.value = null
}

function sync() {
  vw.value = window.innerWidth
  vh.value = window.innerHeight
  const s = step.value
  const el = s && isReady.value ? findTarget(s.target) : null

  if (el !== spotEl.value) {
    unmark()
    if (el) {
      el.setAttribute(SPOT, s.kind)
      spotEl.value = el
    }
  }
  if (el) {
    const r = el.getBoundingClientRect()
    // Big containers (the whole board, the hand) get the ring drawn inside, where no ancestor can clip it.
    flag(el, 'data-tut-big', Math.min(r.width, r.height) > 110)
    const next = { x: r.left, y: r.top, w: r.width, h: r.height }
    const cur = rect.value
    if (!cur || cur.x !== next.x || cur.y !== next.y || cur.w !== next.w || cur.h !== next.h) rect.value = next
  } else if (rect.value) {
    rect.value = null
  }

  // Everything is locked while a step is showing (a waiting reveal included), except an action step whose
  // target cannot be found: that one never locks the player out.
  const locked = !!s && (s.kind === 'info' || !isReady.value || !!el)
  flag(document.body, LOCK, locked)

  const h = cardEl.value ? Math.round(cardEl.value.offsetHeight) : 0
  if (h !== cardH.value) {
    cardH.value = h
    // The card height is what the browser keeps the spot clear of when it scrolls (see scroll-margin below).
    document.documentElement.style.setProperty('--tut-card-h', `${h + 20}px`)
  }
  // Bring a new target into view, once the card is measured so the spot is not left under it.
  if (el && h && scrolledFor !== el) {
    scrolledFor = el
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }
  if (!el) scrolledFor = null

  raf = requestAnimationFrame(sync)
}

onMounted(() => { raf = requestAnimationFrame(sync) })
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  unmark()
  document.body.removeAttribute(LOCK)
  document.documentElement.style.removeProperty('--tut-card-h')
})

/* ── Cosmetic layers: the dim around the spot, the arrow, where the card docks ──────────── */
const PAD = 8
const hole = computed(() => {
  const r = rect.value
  if (!r) return null
  const left = Math.max(0, r.x - PAD)
  const top = Math.max(0, r.y - PAD)
  const right = Math.min(vw.value, r.x + r.w + PAD)
  const bottom = Math.min(vh.value, r.y + r.h + PAD)
  return right > left && bottom > top ? { left, top, right, bottom } : null
})
// With a spot: a transparent box over it whose enormous shadow dims the rest of the window.
const dimStyle = computed(() => {
  const h = hole.value
  return h
    ? { left: `${h.left}px`, top: `${h.top}px`, width: `${h.right - h.left}px`, height: `${h.bottom - h.top}px` }
    : {}
})

const arrowBelow = computed(() => !!hole.value && hole.value.top < 48)
const arrowStyle = computed(() => {
  const h = hole.value
  if (!h) return {}
  const cx = (h.left + h.right) / 2
  return { left: `${Math.min(vw.value - 28, Math.max(4, cx - 12))}px`, top: arrowBelow.value ? `${h.bottom + 2}px` : `${h.top - 28}px` }
})

// The card sits at the bottom of the window, unless that would cover the spot and the top is clear.
const cardSide = computed(() => {
  const r = rect.value
  if (!r) return 'bottom'
  const room = cardH.value + 16
  if (r.y + r.h <= vh.value - room) return 'bottom'
  if (r.y >= room) return 'top'
  return r.y + r.h / 2 > vh.value / 2 ? 'top' : 'bottom'
})
</script>

<!-- Unscoped on purpose: these style elements that belong to the board and the page. -->
<style>
body[data-tut-lock] *:not([data-tutorial-overlay], [data-tutorial-overlay] *) { pointer-events: none !important; }
body[data-tut-lock] [data-tut-spot="action"], body[data-tut-lock] [data-tut-spot="action"] * { pointer-events: auto !important; }

[data-tut-spot] {
  outline: 3px solid #fbbf24 !important;
  outline-offset: 3px;
  /* Keeps scrollIntoView from leaving the spot under the guide's card. */
  scroll-margin: 12px 12px var(--tut-card-h, 200px) 12px;
}
[data-tut-spot][data-tut-big] { outline-offset: -5px; }
/* The board's slots and hand cards are round, so the ring is too. */
[data-tut-spot][data-tut^="slot-"], [data-tut-spot][data-tut^="hand-"] { border-radius: 50%; }
[data-tut-spot="action"] { animation: tut-ring 1.1s ease-in-out infinite; }
@keyframes tut-ring {
  0%, 100% { outline-color: #fbbf24; }
  50% { outline-color: #fff3b0; }
}
</style>

<style scoped>
.tut-root { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; }
/* No spot: the whole window is dimmed. With one: a box over it whose shadow dims everything around it. */
.tut-dim { position: fixed; inset: 0; background: rgba(2, 8, 20, .72); pointer-events: none; transition: opacity .25s ease; }
.tut-dim-off { opacity: 0; }
.tut-dim-hole { inset: auto; background: transparent; border-radius: 12px; box-shadow: 0 0 0 200vmax rgba(2, 8, 20, .72); }
.tut-arrow { position: fixed; width: 24px; text-align: center; font-size: 22px; line-height: 24px; color: #fbbf24; text-shadow: 0 1px 3px rgba(0, 0, 0, .9); pointer-events: none; animation: tut-bounce .8s ease-in-out infinite; }
.tut-arrow-up { animation-name: tut-bounce-up; }

.tut-card { position: fixed; left: 50%; transform: translateX(-50%); width: min(30rem, calc(100vw - 16px)); max-height: 46vh; overflow-y: auto; box-sizing: border-box; padding: 12px 14px; border-radius: 12px; background: #0f172a; color: #fff; border: 2px solid #fbbf24; box-shadow: 0 10px 30px rgba(0, 0, 0, .6); pointer-events: auto; }
.tut-card-top { top: 8px; }
.tut-card-bottom { bottom: 8px; }
.tut-step { margin: 0 0 2px; font-size: .62rem; letter-spacing: .08em; text-transform: uppercase; color: #fcd34d; }
.tut-title { margin: 0 0 4px; font-size: 1rem; font-weight: 800; }
.tut-text { margin: 0; font-size: .82rem; line-height: 1.4; color: #e2e8f0; }
.tut-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; }
.tut-exit { font-size: .7rem; color: #94a3b8; text-decoration: underline; background: none; border: 0; padding: 0; cursor: pointer; }
.tut-exit:hover { color: #fff; }
.tut-next { padding: 6px 16px; border-radius: 8px; background: #22c55e; color: #fff; font-size: .85rem; font-weight: 700; border: 0; cursor: pointer; }
.tut-next:hover { background: #16a34a; }
.tut-hint { font-size: .72rem; font-weight: 700; color: #fcd34d; }

@keyframes tut-bounce { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(6px) } }
@keyframes tut-bounce-up { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
</style>
