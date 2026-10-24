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
  assert.match(tail, /\.gtoon-card-host\.gtoon-calm \.card\.stellar \.heatshield,\s*\.gtoon-card-host\.gtoon-paused \.card\.stellar \.heatshield \{ animation: none; \}/)
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

test('looping effects stay on, but under the frame-rate governor, off-screen pausing and a 30fps cap', () => {
  // started once per card through the engine (so the governor can see every loop), never ad hoc per component
  assert.match(card, /startCardLoops\(c, \{ theme: true, ambient: style\.value\.ambient, params: p \}\)/)
  assert.match(engine, /export async function startCardLoops/)
  assert.match(engine, /governor\.add\(card\)/)
  assert.match(engine, /createLoopGovernor\(\{/)
  assert.match(engine, /if \(!document\.hidden && dt < 3500\) governor\.tick/)
  // cards scrolled out of view stop looping
  assert.match(card, /new IntersectionObserver/)
  assert.match(card, /pauseCardLoops\(cardEl\.value, 'offscreen'\)/)
  // calm mode still removes the stellar glow where loops aren't wanted; pausing stills it too
  assert.match(card, /'gtoon-calm': !\(isFull && ambient\)/)
  assert.match(css, /\.gtoon-card-host\.gtoon-paused \.card\.stellar \.heatshield/)
  // the effects library caps its own frame rate and sizes canvases to the on-screen density
  const fx = readFileSync(new URL('../public/gtoon-card/card-fx.js', import.meta.url), 'utf8')
  assert.match(fx, /const FX_FRAME_MS = 1000 \/ 30/)
  assert.match(fx, /function _fxCardDpr\(/)
  assert.match(fx, /const dpr = _fxCardDpr\(cardEl, 2\)/)
})

test('only revealed slot cards loop; hand cards and face-down cards are always static', () => {
  assert.match(tile, /:ambient="isRevealed && animate"/)
  assert.match(tile, /:effects="isRevealed && animate \? 'full' : 'static'"/)
  assert.match(tile, /<GtoonCard mode="noise" effects="static"/)
})

test('board slots lose their frame once a card is in them; empty slots and hand highlights keep theirs', () => {
  assert.match(tile, /const occupiedSlot = computed\(\(\) => props\.size !== 'hand' && !!\(props\.card \|\| props\.faceDown\)\)/)
  assert.match(tile, /occupiedSlot\.value && \(props\.tone === 'idle' \|\| props\.tone === 'filled'\)\) return 'border-transparent'/)
  assert.match(tile, /idle: props\.card \|\| props\.faceDown \? 'border-indigo-400 bg-white\/5' : 'border-dashed border-white\/20 bg-white\/5'/)
  assert.match(tile, /selected: 'border-amber-400 bg-amber-500\/10'/)
})
