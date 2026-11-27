<template>
  <!-- One fixed, click-through canvas. `aria-hidden`: purely decorative. -->
  <canvas
    ref="canvasRef"
    class="snow-canvas"
    :class="{ 'snow-canvas--hidden': paused }"
    aria-hidden="true"
  ></canvas>
</template>

<script setup>
// December snow: falling flakes, a few of which settle on the top edges of the site chrome and
// melt away again. Mounted (lazily, only in December on non-excluded routes) by
// layouts/newsite-template.vue — see utils/snow.js for the season/route rules and the accumulation
// model/tuning.
//
// Performance rules this file follows, because it runs on every page for every phone in December:
//   • ONE canvas, drawn in ONE pass per frame: flakes are batched into a single path/fill, and each
//     snow cap is one polygon fill. No DOM nodes per flake, no CSS animations, no shadows/blur.
//   • Backing store is 1× CSS pixels even on retina screens (soft white flakes don't need more) —
//     a quarter to a ninth of the fill cost of a native-DPR canvas.
//   • Phones/low-end devices: fewer flakes, 30fps cap, smaller snow caps.
//   • Frame-time watchdog: if frames keep arriving late, flakes are cut, then the effect switches
//     itself off for the rest of the visit rather than make a struggling device worse.
//   • Fully idle when it can't be seen: nothing runs while the tab is hidden or a modal is open,
//     and nothing runs at all with prefers-reduced-motion or the browser's Save-Data mode on.
//   • DOM is only measured on scroll/resize/route-change and a slow 2s timer — never per flake,
//     never per frame unless the page actually moved.
import { MOBILE_QUERY } from '~/utils/siteScale'
import {
  SNOW, PERCH_BINS, createBins, addSnow, meltSnow, flakeCount
} from '~/utils/snow'

const props = defineProps({
  // True while a modal is up. The site chrome is a transformed container, so modals inside it
  // can't out-stack this canvas (see the long note in layouts/newsite-template.vue) — hiding the
  // snow is how they stay on top.
  paused: { type: Boolean, default: false }
})

const canvasRef = ref(null)

// Elements whose top edge can collect snow: the main chrome panels, plus anything a page opts in
// with data-snow-perch. Deliberately a short list — "some elements, not all".
const PERCH_SELECTOR = [
  '[data-snow-perch]',
  '.topbar-primary', '.topbar-nav-left', '.topbar-nav-right',
  '.sidebar-top', '.sidebar-middle', '.sidebar-bottom',
  '.main-content', '.footer'
].join(',')
const MAX_PERCHES = 9
const REMEASURE_MS = 2000
const TAU = Math.PI * 2

let ctx = null
let w = 0
let h = 0
let mobile = false
let lite = false
let minFrameMs = 16
let cap = SNOW.capDesktop
let stickMul = 1

let flakes = []        // [{ x, y, r, vy, sway, freq, phase }]
let perches = []       // [{ el, left, right, top, bins, affinity, max }]
const perchState = new WeakMap() // el → { bins, affinity } so snow survives re-measuring

let rafId = 0
let running = false
let lastTs = 0
let simTime = 0
let rectsDirty = true
let lastMeasure = 0
let resizeTimer = 0
let disabled = false
let slowFrames = 0
let degradeLevel = 0
let mqlMobile = null
let mqlMotion = null

// ── setup ────────────────────────────────────────────────────────────────────────────────────
function motionBlocked() {
  if (mqlMotion?.matches) return true
  // Respect the browser's data-saver / reduced-data signal too.
  return !!navigator.connection?.saveData
}

function configureDevice() {
  mobile = !!mqlMobile?.matches
  lite = (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2
  minFrameMs = mobile || lite ? 33 : 16
  cap = mobile ? SNOW.capMobile : SNOW.capDesktop
  stickMul = mobile ? SNOW.mobileBoost : 1
}

function sizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  w = Math.max(1, window.innerWidth)
  h = Math.max(1, window.innerHeight)
  // 1× backing store on purpose (see the header note).
  canvas.width = w
  canvas.height = h
  ctx = canvas.getContext('2d', { alpha: true, desynchronized: true })
  buildFlakes()
  rectsDirty = true
}

function makeFlake(spawnAnywhere) {
  // Three size classes, so flakes can be drawn as three batched fills; bigger = nearer = faster.
  const sizeClass = Math.random()
  const r = sizeClass < 0.55 ? 1.3 : sizeClass < 0.88 ? 2 : 2.9
  return {
    x: Math.random() * w,
    y: spawnAnywhere ? Math.random() * h : -r - Math.random() * 40,
    r,
    vy: 22 + r * 12 + Math.random() * 14,        // px/s
    sway: 6 + Math.random() * 14,                // px/s of side-to-side drift
    freq: 0.4 + Math.random() * 0.8,
    phase: Math.random() * TAU
  }
}

function buildFlakes() {
  const target = Math.max(8, Math.round(
    flakeCount({ width: w, height: h, mobile, lite }) * [1, 0.6, 0.35][degradeLevel]
  ))
  if (flakes.length > target) flakes.length = target
  while (flakes.length < target) flakes.push(makeFlake(true))
}

// ── perches (accumulation surfaces) ──────────────────────────────────────────────────────────
function isVisible(el) {
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ visibilityProperty: true })
  }
  return el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden'
}

function stateFor(el) {
  let s = perchState.get(el)
  if (!s) {
    // Not every element collects snow, and the ones that do collect different amounts —
    // otherwise every ledge would grow the same tidy white stripe.
    const roll = Math.random()
    s = { bins: createBins(), affinity: roll < 0.3 ? 0 : 0.3 + 0.7 * Math.random() }
    perchState.set(el, s)
  }
  return s
}

// Re-reads the geometry of the elements already being tracked (cheap: used on scroll).
function readRects() {
  for (const p of perches) {
    const r = p.el.getBoundingClientRect()
    p.left = r.left; p.right = r.right; p.top = r.top
  }
  rectsDirty = false
}

// Re-discovers which elements exist/are visible (route changes, layout shifts, slow timer).
function refreshPerches() {
  const next = []
  const els = document.querySelectorAll(PERCH_SELECTOR)
  for (let i = 0; i < els.length && next.length < MAX_PERCHES; i++) {
    const el = els[i]
    const r = el.getBoundingClientRect()
    // On-screen top edge only, and wide enough to be worth a drift. The 6px inset keeps snow off
    // the very top of the viewport where it would just look like a clipped line.
    if (r.width < 60 || r.height < 8 || r.top < 6 || r.top > h - 6) continue
    if (!isVisible(el)) continue
    const s = stateFor(el)
    next.push({ el, left: r.left, right: r.right, top: r.top, bins: s.bins, affinity: s.affinity, max: 0 })
  }
  perches = next
  lastMeasure = performance.now()
  rectsDirty = false
}

// ── simulation + drawing ─────────────────────────────────────────────────────────────────────
function frame(ts) {
  rafId = requestAnimationFrame(frame)
  if (lastTs && ts - lastTs < minFrameMs - 1) return // frame cap
  const rawDt = lastTs ? (ts - lastTs) / 1000 : 0.016
  const dt = Math.min(rawDt, 0.1)                     // a long stall must not teleport flakes
  lastTs = ts
  simTime += dt

  watchdog(rawDt * 1000)

  if (ts - lastMeasure > REMEASURE_MS) refreshPerches()
  else if (rectsDirty) readRects()

  update(dt)
  draw()
}

function update(dt) {
  for (let i = 0; i < flakes.length; i++) {
    const f = flakes[i]
    const prevY = f.y
    f.y += f.vy * dt
    f.x += Math.sin(simTime * f.freq + f.phase) * f.sway * dt
    if (f.x < -4) f.x = w + 4
    else if (f.x > w + 4) f.x = -4

    let landed = false
    for (let p = 0; p < perches.length; p++) {
      const pe = perches[p]
      if (pe.affinity === 0) continue
      // Crossed this element's top edge between last frame and this one, within its width.
      if (prevY < pe.top && f.y >= pe.top && f.x >= pe.left && f.x <= pe.right) {
        if (Math.random() < SNOW.stickChance * pe.affinity * stickMul) {
          const idx = Math.floor(((f.x - pe.left) / (pe.right - pe.left)) * PERCH_BINS)
          addSnow(pe.bins, idx, SNOW.gain, cap)
          landed = true
          break
        }
      }
    }

    if (landed || f.y > h + 6) {
      // Recycle rather than allocate: respawn above the top with fresh randomness.
      flakes[i] = makeFlake(false)
    }
  }

  // Melt after landing so there is always a little decay pressure — the cap can't just fill and
  // stay full. Cheap: perches × 32 bins, and perches with no snow are skipped by `max`.
  for (let p = 0; p < perches.length; p++) {
    perches[p].max = meltSnow(perches[p].bins, dt)
  }
}

function draw() {
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)

  // Snow caps first (under the flakes). One polygon per perch that actually has snow.
  ctx.fillStyle = 'rgba(255,255,255,0.93)'
  for (let p = 0; p < perches.length; p++) {
    const pe = perches[p]
    if (pe.max < 0.15) continue
    const bw = (pe.right - pe.left) / PERCH_BINS
    ctx.beginPath()
    ctx.moveTo(pe.left, pe.top + 1)
    for (let i = 0; i < PERCH_BINS; i++) {
      // Taper the first/last couple of bins so the drift rounds off at the element's corners
      // (the chrome panels have rounded corners; a square white slab would hang past them).
      const edge = Math.min(1, Math.min(i + 0.5, PERCH_BINS - i - 0.5) / 2.5)
      ctx.lineTo(pe.left + (i + 0.5) * bw, pe.top - pe.bins[i] * edge)
    }
    ctx.lineTo(pe.right, pe.top + 1)
    ctx.closePath()
    ctx.fill()
  }

  // Flakes: three batched fills, one per size class.
  const sizes = [1.3, 2, 2.9]
  const alphas = [0.55, 0.75, 0.9]
  for (let c = 0; c < 3; c++) {
    ctx.fillStyle = `rgba(255,255,255,${alphas[c]})`
    ctx.beginPath()
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i]
      if (f.r !== sizes[c]) continue
      ctx.moveTo(f.x + f.r, f.y)
      ctx.arc(f.x, f.y, f.r, 0, TAU)
    }
    ctx.fill()
  }
}

// ── safety valve ─────────────────────────────────────────────────────────────────────────────
// Compares the real gap between frames to the one we asked for. Sustained lateness means the
// device is struggling: shed flakes twice, and if it is still struggling, stop for good.
function watchdog(gapMs) {
  const late = gapMs > minFrameMs * 2.2
  slowFrames = late ? slowFrames + 1 : Math.max(0, slowFrames - 1)
  if (slowFrames < 45) return
  slowFrames = 0
  if (degradeLevel < 2) {
    degradeLevel++
    buildFlakes()
  } else {
    disabled = true
    stop()
    if (canvasRef.value) canvasRef.value.style.display = 'none'
  }
}

// ── lifecycle ────────────────────────────────────────────────────────────────────────────────
function shouldRun() {
  return !disabled && !props.paused && !document.hidden && !motionBlocked()
}

function start() {
  if (running || !shouldRun() || !ctx) return
  running = true
  lastTs = 0
  rectsDirty = true
  lastMeasure = 0 // forces a fresh perch discovery on the first frame
  rafId = requestAnimationFrame(frame)
}

function stop() {
  running = false
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

function sync() {
  if (shouldRun()) start()
  else stop()
}

function onScrollOrMove() { rectsDirty = true }
function onResize() {
  clearTimeout(resizeTimer)
  // Debounced: mobile browsers fire resize continuously as the URL bar slides, and reallocating
  // the backing store for each one would be the most expensive thing this effect does.
  resizeTimer = setTimeout(() => {
    if (Math.abs(window.innerWidth - w) < 2 && Math.abs(window.innerHeight - h) < 2) return
    sizeCanvas()
  }, 200)
}

onMounted(() => {
  mqlMobile = window.matchMedia(MOBILE_QUERY)
  mqlMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  configureDevice()
  sizeCanvas()
  window.addEventListener('scroll', onScrollOrMove, { passive: true, capture: true })
  window.addEventListener('resize', onResize, { passive: true })
  document.addEventListener('visibilitychange', sync)
  mqlMotion.addEventListener('change', sync)
  mqlMobile.addEventListener('change', () => { configureDevice(); buildFlakes() })
  sync()
})

onUnmounted(() => {
  stop()
  clearTimeout(resizeTimer)
  window.removeEventListener('scroll', onScrollOrMove, { capture: true })
  window.removeEventListener('resize', onResize)
  document.removeEventListener('visibilitychange', sync)
  mqlMotion?.removeEventListener('change', sync)
})

watch(() => props.paused, sync)
</script>

<style scoped>
.snow-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  /* Above the page chrome (z auto), below every real modal/overlay (2000+) and the floating
     Daily pill (z-50). Never intercepts a click or tap. */
  z-index: 40;
  pointer-events: none;
  transition: opacity 0.25s ease;
}
.snow-canvas--hidden { opacity: 0; }
</style>
