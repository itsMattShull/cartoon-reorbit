import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isSnowSeason, resolveSnowEnabled, isSnowRoute, SNOW_EXCLUDED_PREFIXES,
  SNOW, PERCH_BINS, createBins, addSnow, meltSnow, flakeCount
} from '../utils/snow.js'
import { GAME_ROUTE_PREFIXES } from '../utils/gameRoutePrefixes.js'

// Local-time constructors on purpose: isSnowSeason uses the visitor's local month.
test('isSnowSeason is true for every day of December and false otherwise', () => {
  assert.equal(isSnowSeason(new Date(2026, 11, 1, 0, 0, 0)), true)
  assert.equal(isSnowSeason(new Date(2026, 11, 31, 23, 59, 59)), true)
  assert.equal(isSnowSeason(new Date(2026, 10, 30, 23, 59, 59)), false)
  assert.equal(isSnowSeason(new Date(2027, 0, 1, 0, 0, 0)), false)
})

test('isSnowSeason repeats every year with no year hard-coded', () => {
  for (const year of [2026, 2027, 2031, 2040]) {
    assert.equal(isSnowSeason(new Date(year, 11, 15)), true)
    assert.equal(isSnowSeason(new Date(year, 5, 15)), false)
  }
})

test('isSnowSeason rejects non-Date input', () => {
  assert.equal(isSnowSeason(null), false)
  assert.equal(isSnowSeason('2026-12-01'), false)
})

test('resolveSnowEnabled honours the visitor override over the calendar', () => {
  const june = new Date(2026, 5, 1)
  const december = new Date(2026, 11, 1)
  assert.equal(resolveSnowEnabled(null, june), false)
  assert.equal(resolveSnowEnabled(null, december), true)
  assert.equal(resolveSnowEnabled('on', june), true)
  assert.equal(resolveSnowEnabled('off', december), false)
  assert.equal(resolveSnowEnabled('garbage', december), true)
})

test('isSnowRoute excludes admin, both gToons games, arcade games and cMoon battles', () => {
  for (const path of [
    '/admin', '/admin/users', '/gtoons', '/gtoons/play', '/gtoons/12',
    '/gtoons-classic', '/gtoons-classic/abc', '/gtoons-classic/tournaments/3',
    '/winball', '/blackjack', '/asteroid', '/cmoon-pvp/5', '/cmoon-raid/9'
  ]) {
    assert.equal(isSnowRoute(path), false, `${path} should not get snow`)
  }
})

test('isSnowRoute excludes every route the site already treats as a game', () => {
  for (const prefix of GAME_ROUTE_PREFIXES) {
    assert.equal(isSnowRoute(prefix), false, `${prefix} should not get snow`)
  }
})

test('isSnowRoute allows ordinary pages, including the Games hub', () => {
  for (const path of ['/', '/home', '/Games', '/cmart', '/MyCollection', '/AuctionHouse/4', '/czone/someone', '/settings', '/lottery']) {
    assert.equal(isSnowRoute(path), true, `${path} should get snow`)
  }
})

test('isSnowRoute is case-insensitive and ignores query strings', () => {
  assert.equal(isSnowRoute('/Admin/Users'), false)
  assert.equal(isSnowRoute('/GTOONS-CLASSIC'), false)
  assert.equal(isSnowRoute('/winball?x=1'), false)
})

test('isSnowRoute does not false-positive on a page that merely shares a prefix', () => {
  assert.equal(isSnowRoute('/gtoonsfaq'), true)
  assert.equal(isSnowRoute('/administrators'), true)
  assert.equal(isSnowRoute('/towerofpower'), true)
})

test('isSnowRoute rejects non-string input', () => {
  assert.equal(isSnowRoute(undefined), false)
  assert.equal(isSnowRoute(null), false)
})

test('SNOW_EXCLUDED_PREFIXES has no duplicates', () => {
  assert.equal(new Set(SNOW_EXCLUDED_PREFIXES).size, SNOW_EXCLUDED_PREFIXES.length)
})

test('addSnow piles up in a hill shape and respects the cap', () => {
  const bins = createBins()
  addSnow(bins, 10, 1, 5)
  assert.equal(bins[10], 1)
  assert.equal(bins[9], 0.5)
  assert.equal(bins[11], 0.5)
  for (let i = 0; i < 100; i++) addSnow(bins, 10, 1, 5)
  assert.equal(bins[10], 5)
  assert.ok(Math.max(...bins) <= 5)
})

test('addSnow clamps out-of-range indexes instead of throwing or writing outside the row', () => {
  const bins = createBins()
  addSnow(bins, -3, 1, 5)
  addSnow(bins, PERCH_BINS + 7, 1, 5)
  assert.equal(bins.length, PERCH_BINS)
  assert.equal(bins[0], 1)
  assert.equal(bins[PERCH_BINS - 1], 1)
})

test('meltSnow decays snow to nothing and reports the tallest bin', () => {
  const bins = createBins()
  addSnow(bins, 5, 3, 5)
  const before = meltSnow(bins, 0)
  assert.ok(before > 0)
  let max = before
  let seconds = 0
  while (max > 0 && seconds < 600) { max = meltSnow(bins, 1); seconds++ }
  assert.equal(max, 0)
  assert.ok(seconds < 300, `took ${seconds}s to melt a 3px drift`)
})

// The two properties the feature is judged on: it must not build up annoyingly while it snows,
// and it must clear itself once flakes stop landing.
function simulate({ flux, affinity, cap, mobile }) {
  const bins = createBins()
  const dt = 1 / 30
  const boost = mobile ? SNOW.mobileBoost : 1
  let peak = 0
  for (let t = 0; t < 600; t += dt) { // 10 minutes of continuous snowfall
    const lambda = flux * SNOW.stickChance * affinity * boost * dt
    let n = Math.floor(lambda) + (Math.random() < lambda % 1 ? 1 : 0)
    while (n--) addSnow(bins, Math.floor(Math.random() * PERCH_BINS), SNOW.gain, cap)
    peak = Math.max(peak, meltSnow(bins, dt))
  }
  const avgWhileSnowing = bins.reduce((a, b) => a + b, 0) / PERCH_BINS
  let t = 0
  let max = 1
  while (max > 0 && t < 600) { max = meltSnow(bins, 1); t++ }
  return { avgWhileSnowing, peak, secondsToClear: t }
}

test('equilibrium: the busiest ledge stays a thin cap and clears itself (desktop)', () => {
  const r = simulate({ flux: 3.6, affinity: 1, cap: SNOW.capDesktop, mobile: false })
  assert.ok(r.avgWhileSnowing > 0.8, `visible: avg ${r.avgWhileSnowing.toFixed(2)}px`)
  assert.ok(r.avgWhileSnowing < 3.5, `thin: avg ${r.avgWhileSnowing.toFixed(2)}px`)
  assert.ok(r.secondsToClear < 120, `clears in ${r.secondsToClear}s once snowfall stops`)
})

test('equilibrium: phones (far fewer flakes) still get a visible but thin cap', () => {
  const r = simulate({ flux: 1.1, affinity: 1, cap: SNOW.capMobile, mobile: true })
  assert.ok(r.avgWhileSnowing > 0.6, `visible: avg ${r.avgWhileSnowing.toFixed(2)}px`)
  assert.ok(r.peak <= SNOW.capMobile)
  assert.ok(r.secondsToClear < 120)
})

test('flakeCount stays small on phones and low-end devices, and bounded on huge screens', () => {
  const phone = flakeCount({ width: 390, height: 844, mobile: true, lite: false })
  const desktop = flakeCount({ width: 1920, height: 1080, mobile: false, lite: false })
  const lowEnd = flakeCount({ width: 1920, height: 1080, mobile: false, lite: true })
  assert.ok(phone >= 18 && phone <= 36, `phone ${phone}`)
  assert.ok(desktop <= 90, `desktop ${desktop}`)
  assert.ok(lowEnd <= 16, `lowEnd ${lowEnd}`)
  assert.ok(phone < desktop)
})
