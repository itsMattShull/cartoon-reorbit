// lib/gtoonCardEngine.js
// Imperative engine behind components/GtoonCard.vue. Ported from the drawcard prototype's page
// script (color sweep, Signal/Noise state machine, heatshield pulse, barcode) and bound to ONE card
// element at a time instead of page globals, so any number of cards can live on a page.
//
// The heavy FX library (public/gtoon-card/card-fx.js, ~190KB) is loaded lazily and only when a card
// actually needs animation; "static" cards never load it.
import { GTOON_PALETTE } from '@/utils/gtoonCardStyle'
import { createLoopGovernor } from '@/lib/gtoonLoopGovernor'

const REVEAL_SETTLE_MS = 1100
const SWEEP_CARD_MS = 600

/* ===================== FX LIBRARY LOADER ===================== */
let fxPromise = null
export function loadCardFx() {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.GtoonFx) return Promise.resolve(window.GtoonFx)
  if (!fxPromise) {
    fxPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = '/gtoon-card/card-fx.js'
      s.async = true
      s.onload = () => { window.GtoonFx?.fxEnsureStyles?.(); resolve(window.GtoonFx) }
      s.onerror = () => { fxPromise = null; reject(new Error('gtoon card-fx failed to load')) }
      document.head.appendChild(s)
    })
  }
  return fxPromise
}

/* ===================== PER-CARD STATE ===================== */
const stateOf = (card) => (card._gt ||= { mode: 0, tokens: new WeakMap(), ambient: {}, timers: new Set(), destroyed: false })
const later = (card, fn, ms) => {
  const st = stateOf(card)
  const id = setTimeout(() => { st.timers.delete(id); if (!st.destroyed) fn() }, ms)
  st.timers.add(id)
  return id
}
const q = (card, sel) => card.querySelector(sel)

/* ===================== STATIC FIELDS ===================== */
export function setCardImage(card, url, alt = '') {
  const wrap = q(card, '.img_wrap')
  if (!wrap) return
  let img = wrap.querySelector('img')
  if (!url) { wrap.replaceChildren(); return }
  if (!img) {
    img = document.createElement('img')
    img.draggable = false
    Object.assign(img.style, { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', margin: 'auto' })
    wrap.replaceChildren(img)
  }
  if (img.getAttribute('src') !== url) img.src = url
  img.alt = alt
}

export function setCardValue(card, value) {
  const p = q(card, '.ptext')
  if (p) p.textContent = value ?? ''
}

export function setCardTheme(card, theme) {
  card.classList.toggle('stellar', theme === 'stellar')
  card.classList.toggle('cosmic', theme === 'cosmic')
}

export function setCardRotation(card, deg) {
  q(card, '.ufo')?.style.setProperty('--ufo-rotation', `${Number(deg) || 0}deg`)
}

/* ===================== COLOR (UFO COLOR SWEEP) ===================== */
function animateWvringSweep(ufoState0, newColorHex, duration) {
  return new Promise(resolve => {
    const sweep = ufoState0 && ufoState0.querySelector('.wvring-sweep')
    if (!sweep) return resolve(true)

    const token = (sweep._sweepToken || 0) + 1
    sweep._sweepToken = token

    const style = window.getComputedStyle(ufoState0)
    if (style.visibility === 'hidden' || style.display === 'none') {
      sweep.style.visibility = 'hidden'
      return resolve(true)
    }

    const leadWidth = 3.0
    const bgAt = (angle) => {
      if (angle <= 0) return 'none'
      const leadStart = Math.max(0, angle - leadWidth)
      return `conic-gradient(from -135deg,
        ${newColorHex} 0deg ${leadStart}deg,
        rgba(255, 255, 255, 0.95) ${leadStart}deg ${angle}deg,
        transparent ${angle}deg 360deg)`
    }

    sweep.style.background = bgAt(0)
    sweep.style.visibility = 'visible'
    const start = performance.now()

    function frame(t) {
      if (sweep._sweepToken !== token) return resolve(false) // superseded by a newer sweep
      const p = Math.min(1, (t - start) / duration)
      sweep.style.background = bgAt(p * 360)
      if (p < 1) requestAnimationFrame(frame)
      else { sweep.style.visibility = 'hidden'; resolve(true) }
    }
    requestAnimationFrame(frame)
  })
}

function pulseWvBrightness(ufoEl, pulseDuration = 400) {
  const wvEl = ufoEl.querySelector('.wv')
  if (!wvEl) return
  const activeColor = ufoEl.style.getPropertyValue('--wvring-color').trim().toLowerCase()
  let peak = 2.5
  if (activeColor === '#cc6600' || activeColor === '#182228') peak = 4.5
  wvEl.animate([{ filter: `brightness(${peak})` }, { filter: 'brightness(1.0)' }],
    { duration: pulseDuration, easing: 'ease-out', fill: 'forwards' })
}

function writeColorVars(ufoEl, palette) {
  ufoEl.style.setProperty('--wvring-color', palette.wvring)
  ufoEl.style.setProperty('--wv-grad-start', palette.wvStart)
  ufoEl.style.setProperty('--wv-grad-end', palette.wvEnd)
}

/** Set the card's color. `animate` runs the UFO Color Sweep first; otherwise it's applied instantly. */
export async function setCardColor(card, colorKey, { animate = false, duration = SWEEP_CARD_MS } = {}) {
  const palette = GTOON_PALETTE[colorKey] || GTOON_PALETTE.SILVER
  const ufoEl = q(card, '.ufo')
  if (!ufoEl) return
  card._gtColor = colorKey
  if (!animate) { writeColorVars(ufoEl, palette); return }
  const completed = await animateWvringSweep(q(ufoEl, '.ufo_state0'), palette.wvring, duration)
  if (!completed || stateOf(card).destroyed) return // a newer color request took over
  writeColorVars(ufoEl, palette)
  pulseWvBrightness(ufoEl, 400)
}

/* ===================== BARCODE ===================== */
const BARCODE_DEFAULT = {
  height: 70, cut: 94, offsetX: 0,
  bars: [
    { w: 6, gap: 0 }, { w: 3, gap: 16 }, { w: 8, gap: 16 }, { w: 4, gap: 16 },
    { w: 6, gap: 6 }, { w: 6, gap: 16 }, { w: 3, gap: 16 }, { w: 8, gap: 16 },
    { w: 8, gap: 5 }, { w: 6, gap: 10 }
  ]
}
const BARCODE_LAYOUT = { count: 10, span: 210, minBar: 3, minGap: 2, barShare: 0.3, height: 70, cut: 94, offsetX: 0 }

function hash32(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  h ^= h >>> 16; h = Math.imul(h, 2246822507)
  h ^= h >>> 13; h = Math.imul(h, 3266489909)
  h ^= h >>> 16
  return h >>> 0
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function generateBarcodeConfig(cardID, charID, layout = BARCODE_LAYOUT) {
  const { count, span, minBar, minGap, barShare } = layout
  const gapCount = count - 1
  const free = span - count * minBar - gapCount * minGap
  const rw = mulberry32(hash32('w:' + cardID))
  const rg = mulberry32(hash32('g:' + charID))
  const bw = Array.from({ length: count }, () => 0.05 + Math.pow(rw(), 3))
  const gw = Array.from({ length: gapCount }, () => 0.15 + rg())
  const bSum = bw.reduce((a, b) => a + b, 0)
  const gSum = gw.reduce((a, b) => a + b, 0)
  const bars = bw.map((w, i) => ({
    w: minBar + free * barShare * (w / bSum),
    gap: i === 0 ? 0 : minGap + free * (1 - barShare) * (gw[i - 1] / gSum)
  }))
  return { ...layout, bars }
}

function buildBarcode(e2, cfg = BARCODE_DEFAULT) {
  if (!e2) return
  e2.querySelector('.barcode-mask')?.remove()
  const r = e2.offsetWidth / 2
  if (!r) return
  const totalW = cfg.bars.reduce((s, b, i) => s + b.w + (i ? b.gap : 0), 0)
  const maxDist = Math.hypot(totalW / 2 + Math.abs(cfg.offsetX), r)
  const H = Math.max(cfg.height, 2 * maxDist)
  const mask = document.createElement('div')
  mask.className = 'barcode-mask'
  mask.style.setProperty('--barcode-cut', cfg.cut + '%')
  const box = document.createElement('div')
  box.className = 'barcode'
  box.style.width = totalW + 'px'
  box.style.height = H + 'px'
  box.style.left = (r - totalW / 2 + cfg.offsetX) + 'px'
  box.style.top = (2 * r - H / 2) + 'px'
  let x = 0
  cfg.bars.forEach((b, i) => {
    x += i ? b.gap : 0
    const centerX = x + b.w / 2
    x += b.w
    const dx = (centerX - totalW / 2) + cfg.offsetX
    const deg = -Math.atan2(dx, r) * 180 / Math.PI
    const bar = document.createElement('div')
    bar.className = 'bar'
    bar.style.left = x - b.w + 'px'
    bar.style.width = b.w + 'px'
    bar.style.transform = `rotate(${deg}deg)`
    box.appendChild(bar)
  })
  mask.appendChild(box)
  e2.appendChild(mask)
}

const finalBarcode = (card) => {
  const seed = card._gtSeed
  return (stateOf(card).mode === 1 && seed) ? generateBarcodeConfig(seed, seed) : BARCODE_DEFAULT
}

export function setCardBarcodeSeed(card, seed) {
  card._gtSeed = seed ? String(seed) : ''
}

/** Draws the final barcode with no animation. */
export function renderBarcode(card) {
  buildBarcode(q(card, '.e2'), finalBarcode(card))
}

/** Flashes random barcodes, slows down, then settles on the card's own (Signal) / default (Noise). */
function fxDecoder(card, duration = 700, stepMs = 55, settleMs = 250) {
  const e2 = q(card, '.e2')
  if (!e2 || !e2.offsetWidth) return
  clearTimeout(e2._decTimer)
  const t0 = performance.now()
  const step = () => {
    if (stateOf(card).destroyed) return
    const p = (performance.now() - t0) / duration
    if (p >= 1) {
      buildBarcode(e2, finalBarcode(card))
      e2.querySelectorAll('.bar').forEach(b =>
        b.animate([{ opacity: 1 }, { opacity: getComputedStyle(b).opacity }], { duration: settleMs, easing: 'ease-out' }))
      return
    }
    buildBarcode(e2, generateBarcodeConfig('d' + Math.random(), 'd' + Math.random(), {
      ...BARCODE_LAYOUT,
      count: 6 + Math.floor(Math.random() * 9),
      offsetX: (Math.random() - 0.5) * 40
    }))
    e2.querySelectorAll('.bar').forEach(b => { b.style.opacity = Math.random() < 0.35 ? '1' : (0.3 + Math.random() * 0.3).toFixed(2) })
    e2._decTimer = setTimeout(step, stepMs * (1 + 2 * p * p))
  }
  step()
}

/* ===================== HEATSHIELD PULSE (stellar / cosmic) ===================== */
function stopHeatshieldPulse(ufoStateEl) {
  ufoStateEl?._heatshieldPulse?.stop()
}

function startHeatshieldPulse(ufoStateEl, options = {}) {
  if (!ufoStateEl) return
  stopHeatshieldPulse(ufoStateEl)
  const heatshield = ufoStateEl.closest('.heatshield')
  if (!heatshield) return
  const energy = heatshield.querySelector('.energy')
  const barrier = heatshield.querySelector('.barrier')
  if (!energy) return

  const card = ufoStateEl.closest('.card')
  const isCosmic = card ? card.classList.contains('cosmic') : false
  const energyBrightness = options.energyBrightness ?? 0.55
  const energySaturate = options.energySaturate ?? 0.90
  const DURATION = isCosmic ? 4000 : 2000
  let rafId = null
  const t0 = performance.now()
  let sA, sB, pA, pB, bsA, bsB, bpA, bpB

  if (isCosmic) {
    sA = { r: 110, g: 145, b: 175, a: 0.5 }
    sB = { r: 30, g: 120, b: 150, a: 1.0 }
    const yShift = options.cosmicEnergyYellowShift ?? 1.0
    const bright = options.cosmicEnergyBrightness ?? 0.75
    pA = { r: Math.min(255, Math.round(245 * bright)), g: Math.min(255, Math.round(250 * bright)), b: Math.min(255, Math.round(210 * bright)), a: 0.55 }
    pB = { r: Math.min(255, Math.round(205 * yShift * bright)), g: Math.min(255, Math.round(215 * bright)), b: Math.max(60, Math.round(110 * (2.5 - yShift))), a: 1.0 }
    if (barrier) {
      bsA = { r: 105, g: 165, b: 195, a: 1.0 }
      bsB = { r: 105, g: 155, b: 185, a: 0.0 }
      const bShift = options.cosmicBarrierYellowShift ?? 0.45
      const bBright = options.cosmicBarrierBrightness ?? 0.85
      bpA = { r: Math.min(255, Math.round(250 * bBright)), g: Math.min(255, Math.round(250 * bBright)), b: Math.min(255, Math.round(215 * bBright)), a: 1.0 }
      bpB = { r: Math.min(255, Math.round(230 * bShift * bBright)), g: Math.min(255, Math.round(225 * bBright)), b: Math.max(80, Math.round(120 * (2.0 - bShift))), a: 0.75 }
    }
  } else {
    sA = { r: 120, g: 120, b: 120, a: 0.5 }
    sB = { r: 136, g: 111, b: 84, a: 1.0 }
    pA = {
      r: 120 + (170 - 120) * energyBrightness * energySaturate,
      g: 120 + (150 - 120) * energyBrightness,
      b: 120 + (130 - 120) * energyBrightness,
      a: 0.5 + (0.75 - 0.5) * energyBrightness
    }
    pB = {
      r: Math.min(255, 136 + (220 - 136) * energyBrightness * energySaturate),
      g: Math.min(255, 111 + (155 - 111) * energyBrightness),
      b: Math.max(0, 84 - (84 - 50) * energyBrightness * energySaturate),
      a: 1.0
    }
  }

  const mix = (a, b, p) => ({
    r: Math.round(a.r + (b.r - a.r) * p), g: Math.round(a.g + (b.g - a.g) * p),
    b: Math.round(a.b + (b.b - a.b) * p), a: (a.a + (b.a - a.a) * p).toFixed(2)
  })
  const css = (c) => `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`

  function animate(now) {
    if (!energy.isConnected) return
    const progress = (Math.sin(((now - t0) / DURATION) * Math.PI - (Math.PI / 2)) + 1) / 2
    energy.style.setProperty('--energy-grad-start', css(mix(sA, pA, progress)))
    energy.style.setProperty('--energy-grad-end', css(mix(sB, pB, progress)))
    if (barrier && isCosmic && bsA) {
      barrier.style.setProperty('--barrier-grad-start', css(mix(bsA, bpA, progress)))
      barrier.style.setProperty('--barrier-grad-end', css(mix(bsB, bpB, progress)))
    }
    rafId = requestAnimationFrame(animate)
  }
  rafId = requestAnimationFrame(animate)

  ufoStateEl._heatshieldPulse = {
    stop() {
      if (rafId) cancelAnimationFrame(rafId)
      energy.style.removeProperty('--energy-grad-start')
      energy.style.removeProperty('--energy-grad-end')
      if (barrier) {
        barrier.style.removeProperty('--barrier-grad-start')
        barrier.style.removeProperty('--barrier-grad-end')
      }
      delete ufoStateEl._heatshieldPulse
    }
  }
}

/* ===================== SIGNAL / NOISE STATE MACHINE ===================== */
function stopAllCardFx(card, fx) {
  const active = fx?.active?.get(card)
  if (!active) return
  Object.keys(active).forEach(key => {
    if (key === 'fxSignal' || key === 'signal') return
    active[key]?.stop?.()
    delete active[key]
  })
  if (Object.keys(active).length === 0) fx.active.delete(card)
}

function resetUfoDataState(card, fx) {
  const ufoStateEl = q(card, '.ufo_state')
  if (!ufoStateEl) return
  const st = stateOf(card)
  st.tokens.set(ufoStateEl, (st.tokens.get(ufoStateEl) || 0) + 1)
  stopHeatshieldPulse(ufoStateEl)
  stopAllCardFx(card, fx)
  st.ambient = {}

  const energy = ufoStateEl.querySelector('.energy')
  const energy2 = ufoStateEl.querySelector('.energy2')
  const wv = ufoStateEl.querySelector('.wv')
  const wvring = ufoStateEl.querySelector('.wvring')
  const ptext = ufoStateEl.querySelector('.ptext')

  ;[energy, energy2, wv, wvring, ptext].forEach(el => {
    if (!el) return
    el.getAnimations().forEach(anim => { anim.onfinish = null; anim.cancel() })
    el.style.cssText = ''
  })
  if (energy) { energy.style.opacity = '0'; energy.style.transform = 'scale(0)' }
  if (energy2) { energy2.style.visibility = 'hidden'; energy2.style.opacity = '0'; energy2.style.transform = 'scale(0)' }
  if (wv) { wv.style.backgroundColor = '#000000'; wv.style.backgroundImage = 'none'; wv.style.filter = 'brightness(1)'; wv.style.opacity = '1' }
  if (wvring) { wvring.style.backgroundColor = '#000000'; wvring.style.backgroundImage = 'none'; wvring.style.opacity = '1' }
  if (ptext) { ptext.style.opacity = '0'; ptext.style.transform = 'translate(-50%, -50%) skewX(-15deg) scaleX(0.9) scale(0)' }
  if (st.mode === 1) fx?.fxSignal?.(card)
}

function animateUfoDataToSignal(card, fx, { themeFx = true } = {}) {
  const st = stateOf(card)
  if (st.mode !== 1) return
  const ufoStateEl = q(card, '.ufo_state')
  if (!ufoStateEl) return
  const energy = ufoStateEl.querySelector('.energy')
  const energy2 = ufoStateEl.querySelector('.energy2')
  const wv = ufoStateEl.querySelector('.wv')
  const wvring = ufoStateEl.querySelector('.wvring')
  const ptext = ufoStateEl.querySelector('.ptext')
  if (!energy || !wv || !ptext) return

  resetUfoDataState(card, fx)
  const runToken = st.tokens.get(ufoStateEl)
  const live = () => st.tokens.get(ufoStateEl) === runToken && !st.destroyed
  ufoStateEl.classList.remove('is-noise')
  if (energy2) energy2.style.visibility = 'visible'

  const energyAnim = energy.animate([
    { transform: 'scale(0)', opacity: 0 },
    { transform: 'scale(1.15)', opacity: 1, offset: 0.7 },
    { transform: 'scale(1)', opacity: 1 }
  ], { duration: 450, easing: 'ease-out' })
  energyAnim.onfinish = () => { if (!live()) return; energy.style.opacity = '1'; energy.style.transform = 'scale(1)' }

  if (energy2) {
    const e2a = energy2.animate([
      { transform: 'scale(0)', opacity: 0 },
      { transform: 'scale(1.3)', opacity: 0.8, offset: 0.6 },
      { transform: 'scale(1)', opacity: 1 }
    ], { duration: 550, delay: 60, easing: 'cubic-bezier(0.25, 1.4, 0.5, 1)' })
    e2a.onfinish = () => { if (!live()) return; energy2.style.opacity = '1'; energy2.style.transform = 'scale(1)' }
    const e2s = energy2.animate([
      { '--e2-start-pos': '10%' },
      { '--e2-start-pos': '12%', offset: 0.75 },
      { '--e2-start-pos': '65%' }
    ], { duration: 550, delay: 60, easing: 'ease-out' })
    e2s.onfinish = () => { if (!live()) return; energy2.style.setProperty('--e2-start-pos', '65%') }
  }

  later(card, () => {
    if (!live()) return
    wv.style.backgroundColor = '#ffffff'
    if (wvring) wvring.style.backgroundColor = '#ffffff'
    const flash = wv.animate([{ filter: 'brightness(3.0)' }, { filter: 'brightness(1.0)' }], { duration: 100, easing: 'ease-out' })
    flash.onfinish = () => {
      if (!live()) return
      wv.style.backgroundColor = ''
      wv.style.background = 'linear-gradient(135deg, var(--wv-grad-start) 0%, var(--wv-grad-end) 60%)'
      if (wvring) { wvring.style.backgroundColor = ''; wvring.style.background = 'var(--wvring-color, var(--wv-grad-start))' }
      const settle = wv.animate([{ filter: 'brightness(1.8)' }, { filter: 'brightness(1.0)' }], { duration: 100, easing: 'ease-out' })
      settle.onfinish = () => {
        if (!live()) return
        wv.style.filter = ''
        // Looping theme effects (heatshield pulse, particles) are started by startCardLoops() once the reveal has
        // settled, so the frame-rate governor can account for them. Make sure nothing from a previous run lingers.
        stopHeatshieldPulse(ufoStateEl)
        stopAllCardFx(card, fx)
        const pa = ptext.animate([
          { opacity: 0, transform: 'translate(-50%, -50%) skewX(-15deg) scaleX(0.9) scale(0)' },
          { opacity: 1, transform: 'translate(-50%, -50%) skewX(-15deg) scaleX(0.9) scale(1.15)', offset: 0.7 },
          { opacity: 1, transform: 'translate(-50%, -50%) skewX(-15deg) scaleX(0.9) scale(1)' }
        ], { duration: 180, easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' })
        pa.onfinish = () => {
          if (!live()) return
          ptext.style.opacity = '1'
          ptext.style.transform = 'translate(-50%, -50%) skewX(-15deg) scaleX(0.9) scale(1)'
        }
      }
    }
  }, 450)
}

function startCardFx(card, fx, key, fn, opts = {}) {
  if (!card || !fx || typeof fn !== 'function') return null
  if (!fx.active.has(card)) fx.active.set(card, {})
  const active = fx.active.get(card)
  active[key]?.stop?.()
  active[key] = fn(card, opts)
  return active[key]
}

function setVisible(card, on) {
  card.querySelectorAll('.ufo_state, .ufo_state0, .energy2').forEach(el => { el.style.visibility = on ? 'visible' : 'hidden' })
}

/** Instant, animation-free Signal state: what small/static cards (lists, cZones, trades...) show. */
export function renderCardStatic(card) {
  const st = stateOf(card)
  st.mode = 1
  setVisible(card, true)
  const wrap = q(card, '.img_wrap')
  if (wrap) wrap.style.visibility = 'visible'
  const ufoState = q(card, '.ufo_state')
  ufoState?.classList.remove('is-noise')
  const energy = q(card, '.energy'), energy2 = q(card, '.energy2'), ptext = q(card, '.ptext')
  if (energy) { energy.style.opacity = '1'; energy.style.transform = 'scale(1)' }
  if (energy2) { energy2.style.opacity = '1'; energy2.style.transform = 'scale(1)'; energy2.style.setProperty('--e2-start-pos', '65%') }
  if (ptext) { ptext.style.opacity = '1'; ptext.style.transform = 'translate(-50%, -50%) skewX(-15deg) scaleX(0.9) scale(1)' }
  renderBarcode(card)
}

/**
 * Instant, animation-free face-down (Noise) state: the aeroshell back with no card-fx, no flipper scanlines and
 * nothing running. This is what every hidden card on the board uses — the animated version
 * (setCardMode(card, 0)) is ~40 permanently animating elements per card, which is far too heavy for a board.
 */
export function renderCardNoiseStatic(card) {
  const st = stateOf(card)
  st.mode = 0
  setVisible(card, false)
  const wrap = q(card, '.img_wrap')
  if (wrap) wrap.style.visibility = 'hidden'
  q(card, '.ufo_state')?.classList.add('is-noise')
  let shell = q(card, '.aeroshell')
  if (!shell) {
    shell = document.createElement('div')
    shell.className = 'aeroshell'
    shell.innerHTML = '<div class="ring2"></div><div class="ring3"></div><div class="rim"></div><div class="ring1"></div><div class="badge"></div>'
    const ufo = q(card, '.ufo') || card
    const shadow = ufo.querySelector(':scope > .shadow')
    if (shadow) shadow.after(shell); else ufo.appendChild(shell)
  }
  shell.style.visibility = 'visible'
  renderBarcode(card)
}

/**
 * Switch the card to 'signal' (lit, revealed) or 'noise' (face-down). Loads the FX library.
 * Resolves once the reveal has settled so callers can start ambient loops / one-shot FX.
 */
export async function setCardMode(card, mode, { themeFx = true } = {}) {
  const fx = await loadCardFx()
  const st = stateOf(card)
  if (st.destroyed) return
  const isSignal = Number(mode) === 1 || mode === 'signal'
  st.mode = isSignal ? 1 : 0
  setVisible(card, isSignal)
  if (isSignal) {
    fx.fxHeatshieldRestore(card)
    setVisible(card, true)
    animateUfoDataToSignal(card, fx, { themeFx })
    fx.fxSignal(card)
    fxDecoder(card, 450)
    await new Promise(r => later(card, r, REVEAL_SETTLE_MS))
  } else {
    const ufoState = q(card, '.ufo_state')
    if (ufoState) {
      resetUfoDataState(card, fx)
      ufoState.classList.add('is-noise')
    }
    fx.fxNoise(card)
    fxDecoder(card, 450)
  }
}

/* ===================== ADMIN-CHOSEN EFFECTS ===================== */
const isStellar = (card) => card.classList.contains('stellar')

const ONE_SHOT = {
  prismaFlare: (fx, card, p) => fx.fxPrismaFlare(card, { duration: p.flareMs }),
  lensFlare: (fx, card, p) => fx.fxLensFlare(card, { duration: p.flareMs }),
  opticalFlare: (fx, card, p) => fx.fxOpticalFlare(card, { duration: p.flareMs }),
  anamorphicFlare: (fx, card, p) => fx.fxAnamorphicFlare(card, { duration: p.flareMs }),
  pulse: (fx, card, p) => fx.fxPulse(card, { loop: p.pulseLoop }),
  gas: (fx, card) => fx.fxGas(card),
  lensLeak: (fx, card) => fx.fxLensLeak(card),
  blackHole: (fx, card, p) => {
    const stellar = isStellar(card)
    return fx.fxBlackHole(card, {
      ringColor: stellar ? '#ffe2b0' : '#6ec0e0',
      duration: p.blackHoleMs,
      glowColors: stellar ? ['#ffa769', '#6bfd7f'] : ['#ffffff', '#2fd6e8'],
      streakColors: stellar ? ['#ffffff', '#ffef95', '#fff4bb', '#7fe8ff'] : ['#ffffff', '#e8ffec', '#8aeaf5', '#19d9ee']
    })
  }
}

const AMBIENT = {
  lightning: (fx, card, p) => fx.fxLightning(card, { frequency: p.lightningDelay }),
  solar: (fx, card) => fx.fxSolarFlare(card),
  heatwave: (fx, card) => fx.fxHeatStrands(card),
  plasma: (fx, card) => fx.fxPlasma(card),
  plasmaLite: (fx, card) => fx.fxPlasmaLite(card),
  fiery: (fx, card) => fx.fxFiery(card),
  starry: (fx, card) => fx.fxStarry(card)
}

export async function playOneShot(card, key, params = {}) {
  const fn = ONE_SHOT[key]
  if (!fn) return
  const fx = await loadCardFx()
  if (stateOf(card).destroyed) return
  try { return fn(fx, card, params) } catch (e) { console.warn('[gtoon] one-shot fx failed', key, e) }
}

export async function startAmbient(card, key, params = {}) {
  const fn = AMBIENT[key]
  if (!fn) return
  const fx = await loadCardFx()
  const st = stateOf(card)
  if (st.destroyed) return
  st.ambient[key]?.stop?.()
  try { st.ambient[key] = fn(fx, card, params) } catch (e) { console.warn('[gtoon] ambient fx failed', key, e) }
}

export function stopAmbient(card, key) {
  const st = stateOf(card)
  if (key) { st.ambient[key]?.stop?.(); delete st.ambient[key]; return }
  Object.values(st.ambient).forEach(i => i?.stop?.())
  st.ambient = {}
}

/* ===================== LOOPING EFFECTS (theme + ambient) ===================== */
/*
 * A card in a board slot keeps its looping effects: the stellar / cosmic heatshield pulse and particles, plus any
 * ambient effects the admin chose. Every such card is allowed to loop, but they are registered with a governor that
 * watches the real frame rate: if the device can't keep up it pauses the OLDEST cards' loops (the newest reveal
 * keeps its effects) and brings them back gradually once there is headroom. Loops also pause for cards scrolled
 * off-screen. Memory is kept down separately (effect canvases are sized to the card's on-screen density).
 */
const governor = createLoopGovernor({
  onPause: (card) => pauseCardLoops(card, 'budget', true),
  onResume: (card) => resumeCardLoops(card, 'budget', true)
})
let sampler = null

/** Samples the page's real frame rate every ~2s while any card is looping, and feeds the governor. */
function startSampler() {
  if (sampler || typeof window === 'undefined') return
  let frames = 0
  let t0 = performance.now()
  const loop = (now) => {
    if (!sampler) return
    frames += 1
    const dt = now - t0
    if (dt >= 2000) {
      // A hidden tab (or a stall) produces a bogus window; only judge ordinary ones.
      if (!document.hidden && dt < 3500) governor.tick((frames * 1000) / dt)
      frames = 0
      t0 = now
      if (governor.runningCount + governor.pausedCount === 0) { sampler = null; return }
    }
    sampler = window.requestAnimationFrame(loop)
  }
  sampler = window.requestAnimationFrame(loop)
}

function startThemeLoops(card, fx) {
  const ufoState = q(card, '.ufo_state')
  if (card.classList.contains('cosmic')) {
    startHeatshieldPulse(ufoState, { type: 'cosmic' })
    startCardFx(card, fx, 'starry', fx.fxStarry)
    startCardFx(card, fx, 'plasmaLite', fx.fxPlasmaLite, { palette: 'optical' })
  } else if (card.classList.contains('stellar')) {
    startHeatshieldPulse(ufoState, { type: 'stellar' })
    startCardFx(card, fx, 'fxFiery', fx.fxFiery)
    startCardFx(card, fx, 'plasmaLite', fx.fxPlasmaLite, { palette: 'solar' })
  }
}

function launchLoops(card, fx) {
  const st = stateOf(card)
  const spec = st.spec
  st.loopsRunning = true
  card.parentElement?.classList.remove('gtoon-paused')
  if (spec.theme) startThemeLoops(card, fx)
  for (const key of spec.ambient) {
    const fn = AMBIENT[key]
    if (!fn) continue
    st.ambient[key]?.stop?.()
    try { st.ambient[key] = fn(fx, card, spec.params) } catch (e) { console.warn('[gtoon] ambient fx failed', key, e) }
  }
}

function haltLoops(card) {
  const st = stateOf(card)
  stopAmbient(card)
  stopHeatshieldPulse(q(card, '.ufo_state'))
  stopAllCardFx(card, window.GtoonFx)
  try { window.GtoonFx?.fxClear?.(card) } catch { /* detached */ }   // drop the frozen last frame of any canvas
  card.parentElement?.classList.add('gtoon-paused')                   // also stills the stellar glow (CSS)
  st.loopsRunning = false
}

/**
 * Start (or restart) the card's looping effects: `theme` runs the stellar / cosmic pulse + particles, `ambient` is the
 * list of admin-chosen effect keys. Registers the card with the frame-rate governor.
 */
export async function startCardLoops(card, { theme = false, ambient = [], params = {} } = {}) {
  const st = stateOf(card)
  st.spec = { theme: !!theme, ambient: [...ambient], params }
  st.pauseReasons ||= new Set()
  const wantsTheme = st.spec.theme && (card.classList.contains('stellar') || card.classList.contains('cosmic'))
  if (!wantsTheme && !st.spec.ambient.length) { stopCardLoops(card); return }
  const fx = await loadCardFx()
  if (st.destroyed || !st.spec) return
  if (st.loopsRunning) haltLoops(card)            // restarting with a new spec
  if (st.pauseReasons.size) return                // off-screen / paused: starts when resumed
  launchLoops(card, fx)
  governor.add(card)
  startSampler()
}

/** Read-only view of the governor, for diagnostics and tests: { budget, running, paused }. */
export function loopStats() {
  return { budget: governor.budget, running: governor.runningCount, paused: governor.pausedCount }
}

export function stopCardLoops(card) {
  const st = stateOf(card)
  st.spec = null
  governor.remove(card)
  if (st.loopsRunning) haltLoops(card)
}

/** Pause for a reason ('offscreen', 'budget', ...). The loops come back once every reason has been cleared. */
export function pauseCardLoops(card, reason = 'manual', byGovernor = false) {
  const st = stateOf(card)
  ;(st.pauseReasons ||= new Set()).add(reason)
  if (!byGovernor) governor.remove(card)
  if (st.loopsRunning) haltLoops(card)
}

export function resumeCardLoops(card, reason = 'manual', byGovernor = false) {
  const st = stateOf(card)
  st.pauseReasons?.delete(reason)
  if (st.destroyed || !st.spec || st.loopsRunning || st.pauseReasons?.size) return
  const fx = window.GtoonFx
  if (!fx) return
  launchLoops(card, fx)
  if (!byGovernor) { governor.add(card); startSampler() }
}

export function clearCardFx(card) {
  stopAmbient(card)
  window.GtoonFx?.fxClear?.(card)
}

/** Tear everything down (call on unmount). */
export function destroyCard(card) {
  if (!card || !card._gt) return
  const st = card._gt
  st.destroyed = true
  st.spec = null
  governor.remove(card)
  st.timers.forEach(clearTimeout)
  st.timers.clear()
  stopAmbient(card)
  stopHeatshieldPulse(q(card, '.ufo_state'))
  try { window.GtoonFx?.fxClear?.(card) } catch { /* card already detached */ }
  clearTimeout(q(card, '.e2')?._decTimer)
  card.getAnimations?.({ subtree: true }).forEach(a => a.cancel())
}
