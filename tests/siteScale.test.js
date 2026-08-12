import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = p => readFileSync(join(root, p), 'utf8')

// utils/siteScale.js is plain ESM with no Nuxt auto-imports, so it imports
// directly — same source-contract style as adminSections / shortCardVarContract.
const {
  computeSiteScale, scaleMarginBottom,
  SITE_WIDTH, SITE_HEIGHT, SITE_PADDING, MOBILE_QUERY, MIN_SITE_SCALE
} = await import(join(root, 'utils/siteScale.js'))

test('renders at full size whenever the window is wide enough', () => {
  for (const w of [1060, 1366, 1440, 1920, 2560]) {
    assert.equal(computeSiteScale(w), 1, `${w}px should not be scaled down`)
  }
})

test('never scales up past 1', () => {
  assert.equal(computeSiteScale(5000), 1)
})

test('scales down proportionally on windows narrower than the chrome', () => {
  // 1040 + 20 padding is the exact break-even point.
  assert.equal(computeSiteScale(1060), 1)
  assert.ok(computeSiteScale(1000) < 1)
  assert.equal(computeSiteScale(1000), 980 / 1040)
})

test('is monotonic in width', () => {
  let prev = 0
  for (let w = 300; w <= 1600; w += 10) {
    const s = computeSiteScale(w)
    assert.ok(s >= prev, `scale decreased from ${prev} to ${s} at ${w}px`)
    prev = s
  }
})

// The regression this file exists for. On the reporter's 1366x768 display the
// old height-aware rule produced ~0.70 no matter what, and browser zoom could
// not raise it because the result depended on a devicePixelRatio baseline
// captured once at mount.
test('the reporter\'s 1366-wide display gets a full-size site', () => {
  assert.equal(computeSiteScale(1366), 1)
})

test('viewport height is ignored unless a route opts in', () => {
  // A 1366x640 laptop: the 867px-tall chrome cannot fit, and that must not
  // shrink the site. This is the exact case from the bug report.
  assert.equal(computeSiteScale(1366), 1)
  assert.equal(computeSiteScale(1366, undefined), 1)
  assert.equal(computeSiteScale(1366, null), 1)
})

test('fitHeight routes still shrink to fit the shorter axis', () => {
  const s = computeSiteScale(1366, 640)
  assert.ok(s < 1, 'a 640px viewport cannot show an 867px chrome at full size')
  assert.equal(s, (640 - SITE_PADDING) / SITE_HEIGHT)
  // Width still wins when it is the tighter constraint.
  assert.equal(computeSiteScale(800, 2000), (800 - SITE_PADDING) / SITE_WIDTH)
})

test('a broken height measurement cannot poison a good width measurement', () => {
  for (const h of [NaN, Infinity, -Infinity]) {
    assert.equal(computeSiteScale(1366, h), 1, `height ${h} must be ignored`)
  }
})

test('a degenerate or hostile measurement can never invert or collapse the layout', () => {
  for (const w of [0, -1, -99999, 1, 19, 20, NaN, Infinity, -Infinity, undefined]) {
    const s = computeSiteScale(w)
    assert.ok(Number.isFinite(s), `scale for ${w} must be finite, got ${s}`)
    assert.ok(s > 0, `scale for ${w} must be positive, got ${s}`)
    assert.ok(s <= 1, `scale for ${w} must not exceed 1, got ${s}`)
    assert.ok(s >= MIN_SITE_SCALE, `scale for ${w} must respect the floor, got ${s}`)
  }
})

test('margin compensation cancels the layout box the transform leaves behind', () => {
  assert.equal(scaleMarginBottom(1), 0)
  assert.equal(scaleMarginBottom(0.5), -SITE_HEIGHT / 2)
  assert.ok(scaleMarginBottom(computeSiteScale(900)) < 0)
})

// Contract tests against the layout itself: these are the invariants that broke.
const layout = read('layouts/newsite-template.vue')
// Comments in this file discuss devicePixelRatio and the old constants at
// length, so the code-contract assertions below run against code only.
const layoutCode = layout
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

test('the layout no longer reads devicePixelRatio', () => {
  assert.ok(
    !/devicePixelRatio/.test(layoutCode),
    'devicePixelRatio is a zoom-dependent value that cannot be baselined at mount; ' +
    'reintroducing it brings back the shrink-on-reload bug'
  )
})

test('the layout derives its sizing from utils/siteScale.js rather than redeclaring it', () => {
  assert.ok(/computeSiteScale/.test(layoutCode), 'layout should call the shared helper')
  for (const literal of ['1040', '862']) {
    assert.ok(
      !new RegExp(`=\\s*${literal}\\b`).test(layoutCode),
      `layout redeclares ${literal}; it must come from utils/siteScale.js`
    )
  }
})

test('the mobile breakpoint matches the media queries the layout ships with', () => {
  const declared = MOBILE_QUERY.match(/max-width:\s*(\d+)px/)[1]
  assert.equal(declared, '768')
  assert.ok(
    layout.includes('@media (max-width: 768px)'),
    'MOBILE_QUERY must stay in step with the layout\'s own CSS'
  )
})

test('the design constants match the CSS custom properties they mirror', () => {
  assert.ok(layout.includes(`--site-container-width:            ${SITE_WIDTH}px`) ||
            new RegExp(`--site-container-width:\\s*${SITE_WIDTH}px`).test(layout),
            `--site-container-width must be ${SITE_WIDTH}px`)
  assert.ok(new RegExp(`--site-container-height:\\s*${SITE_HEIGHT}px`).test(layout),
            `--site-container-height must be ${SITE_HEIGHT}px`)
  assert.equal(SITE_PADDING, 20)
})
