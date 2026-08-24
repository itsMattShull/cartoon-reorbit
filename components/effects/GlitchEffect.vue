<template>
  <div class="gfx-root" :class="{ 'gfx-jitter': phase === 'jitter' }">
    <div v-if="phase === 'jitter'" class="gfx-scanlines"></div>
    <canvas v-show="phase === 'snow'" ref="canvasRef" class="gfx-canvas"></canvas>
  </div>
</template>

<script setup>
// Self-contained TV-glitch visual: jitter transform + scanlines, then TV-static "snow" on a
// canvas. Deliberately scoped to its own root element (not `document.documentElement`, unlike
// the czone-search glitch this was adapted from) so it can never collide with that unrelated,
// still-independent implementation in MyCzone.vue.
const props = defineProps({
  durationMs: { type: Number, default: 2600 },
})
const emit = defineEmits(['done'])

const phase = ref('jitter')
const canvasRef = ref(null)

let ctx = null
let offscreen = null
let offscreenCtx = null
let imageData = null
let rafId = null
let lastFrameTime = 0
const FRAME_INTERVAL_MS = 1000 / 15 // throttled well below display refresh — see performance review

let timers = []
function after(ms, fn) {
  timers.push(setTimeout(fn, ms))
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  canvas.width = Math.ceil(window.innerWidth * dpr)
  canvas.height = Math.ceil(window.innerHeight * dpr)
  ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false

  // One preallocated small buffer, reused every frame rather than a fresh ImageData/canvas per
  // tick (the original czone-search implementation allocated both per frame).
  const sw = Math.max(1, Math.ceil(canvas.width / 6))
  const sh = Math.max(1, Math.ceil(canvas.height / 6))
  offscreen = document.createElement('canvas')
  offscreen.width = sw
  offscreen.height = sh
  offscreenCtx = offscreen.getContext('2d')
  imageData = offscreenCtx.createImageData(sw, sh)
}

function drawSnowFrame(now) {
  rafId = requestAnimationFrame(drawSnowFrame)
  if (now - lastFrameTime < FRAME_INTERVAL_MS) return
  lastFrameTime = now
  if (!ctx || !imageData) return

  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.random() > 0.5 ? 255 : 0
    data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255
  }
  offscreenCtx.putImageData(imageData, 0, 0)
  ctx.drawImage(offscreen, 0, 0, canvasRef.value.width, canvasRef.value.height)
}

function stopSnow() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
}

function onVisibilityChange() {
  if (document.hidden) stopSnow()
  else if (phase.value === 'snow' && !rafId) rafId = requestAnimationFrame(drawSnowFrame)
}

onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibilityChange)

  const jitterMs = Math.round(props.durationMs * 0.4)
  const snowMs = props.durationMs - jitterMs

  after(jitterMs, async () => {
    phase.value = 'snow'
    await nextTick()
    resizeCanvas()
    lastFrameTime = 0
    rafId = requestAnimationFrame(drawSnowFrame)
  })
  after(props.durationMs, () => emit('done'))
})

onBeforeUnmount(() => {
  timers.forEach(clearTimeout)
  timers = []
  stopSnow()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<style scoped>
.gfx-root {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.gfx-jitter {
  animation: gfx-tv-jitter 0.12s steps(1) infinite;
}

@keyframes gfx-tv-jitter {
  0%   { transform: translateX(0px)   skewX(0deg);   }
  8%   { transform: translateX(-9px)  skewX(-0.4deg); }
  16%  { transform: translateX(6px)   skewX(0.3deg);  }
  24%  { transform: translateX(-4px)  skewX(0.2deg);  }
  32%  { transform: translateX(11px)  skewX(-0.5deg); }
  40%  { transform: translateX(-7px)  skewX(0.4deg);  }
  48%  { transform: translateX(3px)   skewX(-0.2deg); }
  56%  { transform: translateX(-12px) skewX(0.6deg);  }
  64%  { transform: translateX(8px)   skewX(-0.3deg); }
  72%  { transform: translateX(-5px)  skewX(0.2deg);  }
  80%  { transform: translateX(10px)  skewX(-0.4deg); }
  88%  { transform: translateX(-3px)  skewX(0.1deg);  }
  96%  { transform: translateX(6px)   skewX(-0.3deg); }
  100% { transform: translateX(0px)   skewX(0deg);   }
}

.gfx-scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(0, 0, 0, 0.18) 3px,
    rgba(0, 0, 0, 0.18) 4px
  );
  background-color: #0a0a0a;
}

.gfx-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
