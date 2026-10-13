import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../assets/css/gtoon-card.css', import.meta.url), 'utf8')
const tile = readFileSync(new URL('../components/OgGtoonCardTile.vue', import.meta.url), 'utf8')
const card = readFileSync(new URL('../components/GtoonCard.vue', import.meta.url), 'utf8')
const engine = readFileSync(new URL('../lib/gtoonCardEngine.js', import.meta.url), 'utf8')

// A board shows ~20 cards. Measured on a phone-sized viewport, forcing GPU layers on every card (will-change,
// preserve-3d, a looping aeroshell per face-down card) meant ~540 compositing layers / ~3 GB of surfaces, which
// iOS Safari answers with "A problem repeatedly occurred". These guard the fixes.

test('card css: the GPU-diet overrides stay in place (no forced layers, flat 3D context, calm mode)', () => {
  const tail = css.slice(css.lastIndexOf('memory / GPU diet'))
  assert.match(tail, /\.gtoon-card-host \.card \{[^}]*will-change: auto/)
  assert.match(tail, /\.gtoon-card-host \.card\.stellar \.ufo \{ transform-style: flat; \}/)
  assert.match(tail, /\.gtoon-card-host \.card \.ufo,/)
  assert.match(tail, /\.energy2,[\s\S]*\.ptext \{ will-change: auto; \}/)
  assert.match(tail, /\.gtoon-card-host\.gtoon-calm \.card\.stellar \.heatshield \{ animation: none; \}/)
})

test('face-down board cards use the static Noise back, never the animated one', () => {
  assert.match(tile, /<GtoonCard mode="noise" effects="static"/)
  assert.doesNotMatch(tile, /mode="noise" effects="full"/)
  assert.match(engine, /export function renderCardNoiseStatic/)
  // the static back must not build the 36-element animated flipper stack
  const body = engine.slice(engine.indexOf('export function renderCardNoiseStatic'), engine.indexOf('export async function setCardMode'))
  assert.doesNotMatch(body, /flipper/)
  assert.match(card, /renderCardNoiseStatic\(c\)/)
})

test('looping theme effects (heatshield pulse, particles) only run where ambient effects are wanted', () => {
  assert.match(card, /themeFx: props\.ambient/)
  assert.match(card, /'gtoon-calm': !\(isFull && ambient\)/)
  assert.match(engine, /if \(!themeFx\) \{/)
})

test('board tiles never ask for ambient loops', () => {
  assert.match(tile, /:ambient="false"/)
})
