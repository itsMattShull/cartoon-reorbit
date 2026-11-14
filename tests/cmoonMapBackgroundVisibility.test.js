// Source-level guarantee that the cMoon raid/PvP battle card lets CMoonEnemyMapBackground's
// fixed, full-viewport, z-index:-1 backdrop actually show through. The card used to be a fully
// opaque `bg-white`, which — combined with `max-w-2xl mx-auto p-4` only constraining width above
// ~672px — fills nearly the entire viewport on a phone, leaving the backdrop visible only in a
// thin page-margin sliver, at the component's own already-subtle opacity (0.08 for
// STATIC_COLOR). This is why an admin-configured map's animated background was reported as never
// actually visible during a raid. Both host pages (raid, PvP) shared the exact same markup, so
// both needed the same fix: a translucent, blurred card background instead of solid white.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

for (const [label, path] of [
  ['raid page', 'pages/newsite/cmoon-raid/[id].vue'],
  ['PvP page', 'pages/newsite/cmoon-pvp/[id].vue'],
]) {
  test(`${label}: the battle card no longer uses an opaque bg-white, and is a translucent flat scrim instead (never backdrop-filter)`, () => {
    const src = read(path)
    assert.doesNotMatch(src, /class="cr-card bg-white/, `${label} should no longer pair cr-card with bg-white`)
    assert.match(src, /class="cr-card rounded border p-4 space-y-3"/, `${label} should still carry cr-card plus its other utility classes`)
    assert.match(src, /\.cr-card\s*\{\s*\n\s*background:\s*rgba\(255,\s*255,\s*255,\s*0\.86\);\s*\n\s*\}/, `${label} should define a translucent .cr-card background`)
    // backdrop-filter: blur() on an always-on-screen element behind a continuously-animating
    // backdrop recomposites every frame for the whole battle — see pages/newsite/blackjack.vue's
    // own .bj-sheet-overlay comment on why this codebase avoids it for exactly this reason.
    assert.doesNotMatch(src, /\.cr-card\s*\{[^}]*backdrop-filter/, `${label} should not use backdrop-filter on the always-on-screen battle card`)
  })
}
