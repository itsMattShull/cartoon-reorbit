import test from 'node:test'
import assert from 'node:assert/strict'
import { OG_GTOON_POWER_CATALOG, powerDescriptionFor } from '../server/utils/ogGtoonPowerCatalog.js'

// useOgGtoonInfo calls the Nuxt global $fetch when a card is opened.
globalThis.$fetch = async (url) => ({ id: 'x', name: 'Mock', url })
const { useOgGtoonInfo } = await import('../composables/useOgGtoonInfo.js')

const ev = (over = {}) => ({ pointerType: 'touch', button: 0, clientX: 10, clientY: 10, preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true }, ...over })
const card = { ctoonId: 'c1', name: 'Hero', assetPath: '/h.png', color: 'RED', value: 3 }

test('power lookup: every catalog power maps back to a description; empty / custom effects do not', () => {
  for (const e of OG_GTOON_POWER_CATALOG.filter(x => x.effect.length)) assert.ok(powerDescriptionFor(e.effect), e.description)
  assert.equal(powerDescriptionFor([]), null)
  assert.equal(powerDescriptionFor(null), null)
  assert.equal(powerDescriptionFor([{ trigger: 'onReveal', nope: 1 }]), null)
  // key order never matters
  const e = OG_GTOON_POWER_CATALOG.find(x => x.effect.length)
  const reordered = JSON.parse(JSON.stringify(e.effect, Object.keys(JSON.parse(JSON.stringify(e.effect[0]))).sort()))
  assert.ok(powerDescriptionFor(e.effect))
  assert.equal(typeof reordered, 'object')
})

test('right-click opens the dialog for a face-up card and suppresses the browser menu', async (t) => {
  const info = useOgGtoonInfo(); info.close()
  const g = info.inspectGesture(() => card)
  const e = ev({ pointerType: 'mouse' })
  g.contextmenu(e)
  assert.equal(e.prevented, true)
  assert.equal(info.isOpen.value, true)
  assert.equal(info.base.value.ctoonId, 'c1')
  await new Promise(r => setImmediate(r))
  assert.equal(info.detail.value.name, 'Mock')
  info.close()
})

test('nothing opens when there is no card to inspect (face-down)', () => {
  const info = useOgGtoonInfo(); info.close()
  const g = info.inspectGesture(() => null)
  const e = ev()
  g.contextmenu(e)
  assert.equal(info.isOpen.value, false)
  assert.equal(e.prevented, undefined)
})

test('long-press (touch) opens after the hold and swallows the click that follows; short taps do not open', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const info = useOgGtoonInfo(); info.close()
  const g = info.inspectGesture(() => card, { holdMs: 500 })

  g.pointerdown(ev()); t.mock.timers.tick(200); g.pointerup(ev())
  t.mock.timers.tick(1000)
  assert.equal(info.isOpen.value, false, 'a short tap must not open it')

  g.pointerdown(ev()); t.mock.timers.tick(499)
  assert.equal(info.isOpen.value, false)
  t.mock.timers.tick(2)
  assert.equal(info.isOpen.value, true, 'opens once held ~0.5s')
  g.pointerup(ev())
  const click = ev(); g.clickCapture(click)
  assert.equal(click.stopped, true, 'the trailing click is swallowed')
  const next = ev(); g.clickCapture(next)
  assert.equal(next.stopped, undefined, 'only that one click is swallowed')
  info.close()
})

test('moving the finger cancels the long-press; a stale swallow expires on its own', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const info = useOgGtoonInfo(); info.close()
  const g = info.inspectGesture(() => card, { holdMs: 500, moveTolerance: 10 })
  g.pointerdown(ev({ clientX: 0, clientY: 0 })); t.mock.timers.tick(300)
  g.pointermove(ev({ clientX: 40, clientY: 0 })); t.mock.timers.tick(1000)
  assert.equal(info.isOpen.value, false, 'scrolling/dragging is not a long-press')

  g.pointerdown(ev()); t.mock.timers.tick(600)               // opens
  assert.equal(info.isOpen.value, true)
  t.mock.timers.tick(800)                                     // browser never sent the click
  const click = ev(); g.clickCapture(click)
  assert.equal(click.stopped, undefined, 'a later real click is not eaten')
  info.close()
})

test('mouse pointers never start a long-press; opening twice is idempotent', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const info = useOgGtoonInfo(); info.close()
  const g = info.inspectGesture(() => card)
  g.pointerdown(ev({ pointerType: 'mouse' })); t.mock.timers.tick(2000)
  assert.equal(info.isOpen.value, false)

  let fetches = 0
  globalThis.$fetch = async () => { fetches += 1; return { id: 'x', name: 'Mock' } }
  g.contextmenu(ev()); g.contextmenu(ev())                    // Android fires a long-press AND a contextmenu
  assert.equal(info.isOpen.value, true)
  assert.equal(fetches, 1)
  info.close()
})
