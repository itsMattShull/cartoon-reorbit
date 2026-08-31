<template>
  <div class="fwx-root" :style="{ animationDuration: durationMs + 'ms' }">
    <canvas ref="canvasRef" class="fwx-canvas"></canvas>
    <div class="fwx-cover" :style="{ animationDelay: burstMs + 'ms', animationDuration: coverMs + 'ms' }"></div>
  </div>
</template>

<script setup>
// Stage 1: several blue firework bursts animate on a canvas (shoot out). Stage 2: a solid blue
// wash fades in behind them (covers the screen), holds. Stage 3 (root-level): everything fades
// to transparent. Particle count is a hard GLOBAL budget shared across all bursts (not
// per-burst), and bursts are staggered so their peaks don't stack — a naive per-burst count would
// let simultaneous bursts multiply per-frame physics cost (see performance review). Same rAF
// throttle / DPR-cap / visibility-pause pattern as GlitchEffect.vue and SnakeEffect.vue.
const props = defineProps({
  durationMs: { type: Number, default: 2800 },
})
const emit = defineEmits(['done'])

const canvasRef = ref(null)
let ctx = null
let dpr = 1
let particles = []
let rafId = null
let lastFrameTime = 0
const FRAME_INTERVAL_MS = 1000 / 20

const BURST_COUNT = 5
const GLOBAL_PARTICLE_BUDGET = 160
const PARTICLES_PER_BURST = Math.floor(GLOBAL_PARTICLE_BUDGET / BURST_COUNT)
const PARTICLE_LIFE_MS = 1000

// Bursts fire across the first ~55% of the run, spaced so no two peaks overlap much.
const burstMs = Math.round(props.durationMs * 0.55)
const coverMs = Math.round(props.durationMs * 0.2)
const burstStartTimes = Array.from({ length: BURST_COUNT }, (_, i) => Math.round((i / BURST_COUNT) * (burstMs - PARTICLE_LIFE_MS * 0.4)))

const BLUES = ['#4fc3f7', '#2196f3', '#1565c0', '#00e5ff', '#82b1ff']

let timers = []
function after(ms, fn) {
  timers.push(setTimeout(fn, ms))
}

function spawnBurst() {
  const w = window.innerWidth
  const h = window.innerHeight
  const cx = w * (0.25 + Math.random() * 0.5)
  const cy = h * (0.2 + Math.random() * 0.35)
  const color = BLUES[Math.floor(Math.random() * BLUES.length)]
  for (let i = 0; i < PARTICLES_PER_BURST; i++) {
    const angle = (Math.PI * 2 * i) / PARTICLES_PER_BURST + Math.random() * 0.3
    const speed = 1.4 + Math.random() * 2.2
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: PARTICLE_LIFE_MS,
      color,
    })
  }
}

function setupCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  canvas.width = Math.ceil(window.innerWidth * dpr)
  canvas.height = Math.ceil(window.innerHeight * dpr)
  ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function drawFrame(now) {
  rafId = requestAnimationFrame(drawFrame)
  if (now - lastFrameTime < FRAME_INTERVAL_MS) return
  const dt = lastFrameTime ? Math.min(now - lastFrameTime, 100) : FRAME_INTERVAL_MS
  lastFrameTime = now
  if (!ctx) return

  ctx.clearRect(0, 0, canvasRef.value.width / dpr, canvasRef.value.height / dpr)
  if (!particles.length) return

  const GRAVITY = 0.0018
  const next = []
  for (const p of particles) {
    p.life -= dt
    if (p.life <= 0) continue
    p.vy += GRAVITY * dt
    p.x += p.vx * (dt / 16)
    p.y += p.vy * (dt / 16)
    const alpha = Math.max(0, p.life / PARTICLE_LIFE_MS)
    ctx.globalAlpha = alpha
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
    ctx.fill()
    next.push(p)
  }
  ctx.globalAlpha = 1
  particles = next
}

function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
}

function onVisibilityChange() {
  if (document.hidden) stopLoop()
  else if (!rafId) { lastFrameTime = 0; rafId = requestAnimationFrame(drawFrame) }
}

onMounted(async () => {
  await nextTick()
  setupCanvas()
  rafId = requestAnimationFrame(drawFrame)
  burstStartTimes.forEach((t) => after(t, spawnBurst))
  document.addEventListener('visibilitychange', onVisibilityChange)
  after(props.durationMs, () => emit('done'))
})

onBeforeUnmount(() => {
  timers.forEach(clearTimeout)
  timers = []
  stopLoop()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  particles = []
})
</script>

<style scoped>
.fwx-root {
  position: absolute;
  inset: 0;
  overflow: hidden;
  animation-name: fwx-root-fade;
  animation-timing-function: ease-in-out;
  animation-fill-mode: forwards;
}

@keyframes fwx-root-fade {
  0%   { opacity: 1; }
  80%  { opacity: 1; }
  100% { opacity: 0; }
}

.fwx-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.fwx-cover {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 40%, #2196f3 0%, #0d47a1 70%, #082e6e 100%);
  opacity: 0;
  animation-name: fwx-cover-in;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}

@keyframes fwx-cover-in {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}
</style>
