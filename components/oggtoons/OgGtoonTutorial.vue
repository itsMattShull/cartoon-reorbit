<!-- components/oggtoons/OgGtoonTutorial.vue -->
<!-- The guide for the original gToons (2002) tutorial match. Rendered by OgGtoonMatchBoard.vue on top
     of the live board. It dims everything except the one thing the current step points at: for an
     action step that is the only place a tap gets through, so the player can only ever do the move the
     script needs; for an info step nothing gets through and its button moves on. The steps themselves
     live in utils/ogGtoonTutorialSteps.js; the board marks the things they point at with data-tut. -->
<template>
  <div v-if="step" class="tut-root" data-tutorial-overlay>
    <!-- A reveal is animating: hold everything still, say nothing yet. -->
    <div v-if="!isReady" class="tut-block" :style="FULL"></div>

    <template v-else>
      <template v-if="hole">
        <div v-for="(b, i) in blockers" :key="i" class="tut-block" :style="b"></div>
        <!-- An info step highlights its target but lets no tap through; its button is the way on. -->
        <div v-if="step.kind === 'info'" class="tut-block tut-clear" :style="holeStyle"></div>
        <div class="tut-ring" :class="{ 'tut-ring-action': step.kind === 'action' }" :style="holeStyle"></div>
        <div v-if="step.kind === 'action'" class="tut-arrow" :class="{ 'tut-arrow-up': arrowBelow }" :style="arrowStyle" aria-hidden="true">{{ arrowBelow ? '▲' : '▼' }}</div>
      </template>
      <!-- Nothing to point at: an info step still dims the board; an action step never locks the player out. -->
      <div v-else-if="step.kind === 'info'" class="tut-block" :style="FULL"></div>

      <div class="tut-card" :class="[cardSide]" role="dialog" aria-live="polite" :aria-label="step.title">
        <p class="tut-step">Step {{ index + 1 }} of {{ total }}</p>
        <h3 class="tut-title">{{ step.title }}</h3>
        <p class="tut-text">{{ step.text }}</p>
        <div class="tut-foot">
          <button class="tut-exit" @click="$emit('exit')">Exit tutorial</button>
          <button v-if="step.kind === 'info'" class="tut-next" @click="advance">{{ step.button || 'Next' }}</button>
          <span v-else class="tut-hint">{{ hole ? 'Tap the highlighted spot' : 'Follow the instruction above' }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { TUTORIAL_STEPS, settleStepIndex } from '@/utils/ogGtoonTutorialSteps'

const props = defineProps({
  // What the board knows right now (see the ctx description in utils/ogGtoonTutorialSteps.js).
  board: { type: Object, required: true }
})
const emit = defineEmits(['exit', 'finish'])

const FULL = { left: '0px', top: '0px', right: '0px', bottom: '0px' }
const PAD = 6

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

/* ── Following the target around the screen ─────────────────────────────────────────────── */
const vw = ref(typeof window === 'undefined' ? 1024 : window.innerWidth)
const vh = ref(typeof window === 'undefined' ? 768 : window.innerHeight)
const rect = ref(null) // { x, y, w, h } of the first visible element the step points at
let raf = 0

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

function track() {
  vw.value = window.innerWidth
  vh.value = window.innerHeight
  const el = isReady.value ? findTarget(step.value?.target) : null
  if (!el) {
    if (rect.value) rect.value = null
  } else {
    const r = el.getBoundingClientRect()
    const next = { x: r.left, y: r.top, w: r.width, h: r.height }
    const cur = rect.value
    if (!cur || cur.x !== next.x || cur.y !== next.y || cur.w !== next.w || cur.h !== next.h) rect.value = next
  }
  raf = requestAnimationFrame(track)
}
onMounted(() => { raf = requestAnimationFrame(track) })
onBeforeUnmount(() => cancelAnimationFrame(raf))

// Bring a new target into view (page and any scrolling panel it sits in); a no-op if already visible.
watch([() => step.value?.id, isReady], async ([, ready]) => {
  if (!ready) return
  await nextTick()
  const el = findTarget(step.value?.target)
  el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
})

/* ── The spotlight: four blockers around a hole the size of the target ──────────────────── */
const hole = computed(() => {
  const r = rect.value
  if (!r) return null
  const left = Math.max(0, r.x - PAD)
  const top = Math.max(0, r.y - PAD)
  const right = Math.min(vw.value, r.x + r.w + PAD)
  const bottom = Math.min(vh.value, r.y + r.h + PAD)
  return right > left && bottom > top ? { left, top, right, bottom } : null
})
const holeStyle = computed(() => {
  const h = hole.value
  return h ? { left: `${h.left}px`, top: `${h.top}px`, width: `${h.right - h.left}px`, height: `${h.bottom - h.top}px` } : {}
})
const blockers = computed(() => {
  const h = hole.value
  if (!h) return []
  return [
    { left: '0px', top: '0px', right: '0px', height: `${h.top}px` },
    { left: '0px', top: `${h.bottom}px`, right: '0px', bottom: '0px' },
    { left: '0px', top: `${h.top}px`, width: `${h.left}px`, height: `${h.bottom - h.top}px` },
    { left: `${h.right}px`, top: `${h.top}px`, right: '0px', height: `${h.bottom - h.top}px` }
  ]
})

// The arrow sits above the hole (pointing down), or below it when there is no room above.
const arrowBelow = computed(() => !!hole.value && hole.value.top < 48)
const arrowStyle = computed(() => {
  const h = hole.value
  if (!h) return {}
  const cx = (h.left + h.right) / 2
  return { left: `${cx - 12}px`, top: arrowBelow.value ? `${h.bottom + 2}px` : `${h.top - 28}px` }
})

// The card docks in whichever half of the screen the target is not in, so it never covers it.
const cardSide = computed(() => {
  const h = hole.value
  if (!h) return 'tut-card-mid'
  return (h.top + h.bottom) / 2 > vh.value / 2 ? 'tut-card-top' : 'tut-card-bottom'
})
</script>

<style scoped>
.tut-root { position: fixed; inset: 0; z-index: 60; pointer-events: none; }
.tut-block { position: fixed; background: rgba(2, 8, 20, .72); pointer-events: auto; }
.tut-clear { background: transparent; }
.tut-ring { position: fixed; border-radius: 12px; border: 3px solid #fbbf24; box-shadow: 0 0 0 2px rgba(0, 0, 0, .45), 0 0 18px rgba(251, 191, 36, .75); pointer-events: none; }
.tut-ring-action { animation: tut-pulse 1.1s ease-in-out infinite; }
.tut-arrow { position: fixed; width: 24px; text-align: center; font-size: 22px; line-height: 24px; color: #fbbf24; text-shadow: 0 1px 3px rgba(0, 0, 0, .9); pointer-events: none; animation: tut-bounce .8s ease-in-out infinite; }
.tut-arrow-up { animation-name: tut-bounce-up; }

.tut-card { position: fixed; left: 50%; transform: translateX(-50%); width: min(30rem, calc(100vw - 16px)); max-height: 46vh; overflow-y: auto; box-sizing: border-box; padding: 12px 14px; border-radius: 12px; background: #0f172a; color: #fff; border: 2px solid #fbbf24; box-shadow: 0 10px 30px rgba(0, 0, 0, .6); pointer-events: auto; }
.tut-card-top { top: 8px; }
.tut-card-bottom { bottom: 8px; }
.tut-card-mid { top: 50%; transform: translate(-50%, -50%); }
.tut-step { margin: 0 0 2px; font-size: .62rem; letter-spacing: .08em; text-transform: uppercase; color: #fcd34d; }
.tut-title { margin: 0 0 4px; font-size: 1rem; font-weight: 800; }
.tut-text { margin: 0; font-size: .82rem; line-height: 1.4; color: #e2e8f0; }
.tut-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; }
.tut-exit { font-size: .7rem; color: #94a3b8; text-decoration: underline; }
.tut-exit:hover { color: #fff; }
.tut-next { padding: 6px 16px; border-radius: 8px; background: #22c55e; color: #fff; font-size: .85rem; font-weight: 700; }
.tut-next:hover { background: #16a34a; }
.tut-hint { font-size: .72rem; font-weight: 700; color: #fcd34d; }

@keyframes tut-pulse { 0%, 100% { box-shadow: 0 0 0 2px rgba(0, 0, 0, .45), 0 0 10px rgba(251, 191, 36, .6) } 50% { box-shadow: 0 0 0 2px rgba(0, 0, 0, .45), 0 0 26px rgba(251, 191, 36, 1) } }
@keyframes tut-bounce { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(6px) } }
@keyframes tut-bounce-up { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
</style>
