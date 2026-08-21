<template>
  <Teleport to="body">
    <div v-if="isOpen" class="cje-overlay" :style="{ background: overlayBackground }" @click="skip">
      <div class="cje-rise-layer" aria-hidden="true">
        <img
          v-for="node in nodes"
          :key="node.id"
          :src="node.src"
          class="cje-rise-img"
          :style="{
            left: node.left,
            animationDelay: node.delay,
            animationDuration: node.duration,
            '--cje-rot-start': node.rotStart,
            '--cje-rot-end': node.rotEnd,
            '--cje-scale': node.scale,
            width: node.size,
          }"
          alt=""
        />
      </div>

      <transition name="cje-message-fade">
        <div v-if="phase === 'message' && messageText" class="cje-message-wrap">
          <p class="cje-message">{{ messageText }}</p>
        </div>
      </transition>
    </div>
  </Teleport>
</template>

<script setup>
import { useCMoonJoinEffect } from '~/composables/useCMoonJoinEffect'

const { isOpen, effect, hide } = useCMoonJoinEffect()

const MESSAGE_HOLD_MS = 3500
const DISSOLVE_MS = 500
const MAX_NODES = 28
const PRELOAD_TIMEOUT_MS = 800
const REDUCED_MOTION_FILL_MS = 1200

const phase = ref(null) // 'fill' | 'message' | null
const nodes = ref([])
let timers = []

const messageText = computed(() => effect.value?.message || '')
const overlayBackground = computed(() => {
  const color = effect.value?.cMoonColor
  const safe = /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#3399cc'
  return `radial-gradient(circle at 50% 30%, ${safe}3d, #05070c 78%)`
})

function clearTimers() {
  timers.forEach(t => clearTimeout(t))
  timers = []
}

function schedule(fn, ms) {
  const id = setTimeout(fn, ms)
  timers.push(id)
  return id
}

function skip() {
  clearTimers()
  hide()
  phase.value = null
  nodes.value = []
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function buildNodes(images, fillMs) {
  if (!images.length) return []
  const count = Math.min(MAX_NODES, Math.max(images.length * 3, 12))
  // Every node's delay + duration must fit inside fillMs, or clearing nodes
  // at the end of the fill phase would cut an in-flight rise animation off
  // abruptly instead of letting it finish.
  const durationMs = Math.min(fillMs * 0.45, 3500)
  const spawnWindowMs = Math.max(fillMs - durationMs, 0)
  return Array.from({ length: count }, (_, i) => {
    const img = images[i % images.length]
    return {
      id: `${img.id}-${i}`,
      src: img.imagePath,
      left: `${Math.random() * 90}%`,
      delay: `${Math.random() * spawnWindowMs}ms`,
      duration: `${durationMs}ms`,
      rotStart: `${(Math.random() * 30 - 15).toFixed(1)}deg`,
      rotEnd: `${(Math.random() * 60 - 30).toFixed(1)}deg`,
      scale: (0.85 + Math.random() * 0.5).toFixed(2),
      size: `${56 + Math.round(Math.random() * 40)}px`,
    }
  })
}

function preloadImages(images) {
  if (typeof window === 'undefined' || !images.length) return Promise.resolve()
  const loaders = images.map(img => new Promise((resolve) => {
    const el = new Image()
    el.onload = resolve
    el.onerror = resolve
    el.src = img.imagePath
    if (el.decode) el.decode().then(resolve).catch(() => {})
  }))
  const timeout = new Promise(resolve => schedule(resolve, PRELOAD_TIMEOUT_MS))
  return Promise.race([Promise.all(loaders), timeout])
}

async function run() {
  const current = effect.value
  if (!current) return
  const images = Array.isArray(current.images) ? current.images : []
  const hasMessage = !!current.message

  if (!images.length && !hasMessage) {
    hide()
    return
  }

  const reduced = prefersReducedMotion()

  if (images.length && !reduced) {
    await preloadImages(images)
    if (!isOpen.value) return // dismissed while preloading
    nodes.value = buildNodes(images, current.durationMs)
    phase.value = 'fill'
    schedule(() => { advanceToMessage(hasMessage) }, current.durationMs)
  } else if (images.length) {
    // Reduced motion: skip the rising animation, just hold briefly on a
    // static, non-animated moment before the message.
    nodes.value = []
    phase.value = 'fill'
    schedule(() => { advanceToMessage(hasMessage) }, REDUCED_MOTION_FILL_MS)
  } else {
    advanceToMessage(hasMessage)
  }
}

function advanceToMessage(hasMessage) {
  nodes.value = []
  if (!hasMessage) {
    dissolveAndClose()
    return
  }
  phase.value = 'message'
  schedule(dissolveAndClose, MESSAGE_HOLD_MS)
}

function dissolveAndClose() {
  phase.value = null
  schedule(hide, DISSOLVE_MS)
}

watch(isOpen, (open) => {
  if (typeof document !== 'undefined') document.body.style.overflow = open ? 'hidden' : ''
  if (open) {
    clearTimers()
    run()
  } else {
    clearTimers()
    phase.value = null
    nodes.value = []
  }
})

onBeforeUnmount(() => {
  clearTimers()
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<style scoped>
.cje-overlay {
  position: fixed;
  inset: 0;
  height: 100vh;
  height: 100dvh;
  z-index: 3000;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.cje-rise-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.cje-rise-img {
  position: absolute;
  bottom: -4rem;
  height: auto;
  object-fit: contain;
  opacity: 0;
  animation-name: cje-rise;
  animation-timing-function: ease-in;
  animation-fill-mode: forwards;
  will-change: transform, opacity;
}

@keyframes cje-rise {
  0% { transform: translateY(0) rotate(var(--cje-rot-start)) scale(var(--cje-scale)); opacity: 0; }
  10% { opacity: 1; }
  80% { opacity: 1; }
  100% { transform: translateY(-115vh) rotate(var(--cje-rot-end)) scale(var(--cje-scale)); opacity: 0; }
}

.cje-message-wrap {
  position: relative;
  z-index: 1;
  max-width: min(90vw, 640px);
  padding: 24px 28px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  text-align: center;
}

.cje-message {
  margin: 0;
  color: #fff;
  font-family: 'Nunito', sans-serif;
  font-weight: 800;
  font-size: clamp(1.25rem, 5vw, 2.25rem);
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
  word-break: break-word;
}

.cje-message-fade-enter-active,
.cje-message-fade-leave-active { transition: opacity 0.5s ease; }
.cje-message-fade-enter-from,
.cje-message-fade-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .cje-rise-img { animation: none; opacity: 0; }
}
</style>
