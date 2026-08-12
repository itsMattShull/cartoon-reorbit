// Sizing rule for the fixed-size "retro" newsite chrome.
//
// The chrome is authored at a fixed SITE_WIDTH x SITE_HEIGHT and shrunk with
// `transform: scale()` when the window is too narrow for it. Kept here as pure
// functions so the rule is testable without a browser (see tests/siteScale.test.js)
// and so the numbers can't drift between the JS and the CSS.
//
// WIDTH ONLY, DELIBERATELY. An earlier version also divided by the viewport
// height, which made the chrome shrink to ~70% on any laptop shorter than about
// 1050px — the 862px design height simply doesn't fit a 768px screen. Two
// consequences, both bad:
//
//   1. The site was permanently small on the most common laptop resolution.
//   2. Browser zoom could not fix it. Fitting to the viewport is inherently
//      zoom-proof: zooming shrinks the CSS viewport by exactly the factor the
//      scale grows, so the *physical* size never changes. The old code tried to
//      work around that by normalising against a `devicePixelRatio` captured
//      once on mount and assumed to be 100% zoom — an assumption that is simply
//      false for anyone whose browser persists a zoom level per origin. Their
//      page loaded already-zoomed, the captured baseline was wrong, and the
//      site shrank on every reload and shrank again if zoom was reset.
//
// Scaling on width alone means the chrome renders at its intended size whenever
// the window is wide enough and the page scrolls vertically when it isn't.
// Browser zoom then behaves the way it does on any normal site, with no
// devicePixelRatio reads and nothing to keep in sync across reloads.
// Pages that genuinely cannot afford a scrolling page — timed canvas games, and
// blackjack, whose table measures itself against the document's overflow — opt
// back into height-aware fitting with `definePageMeta({ fitHeight: true })`.
// They keep the old shrink-to-fit behaviour (minus the zoom bug) so the whole
// playfield stays on screen.
export const SITE_WIDTH = 1040

// The sum of the grid tracks: topbar 105 + sidebar 682 + footer 60, plus two
// 10px row gaps. The container was declared 862px for a long time, which quietly
// clipped the bottom 5px of the footer against `overflow: hidden`. Keep this in
// step with --site-container-height.
export const SITE_HEIGHT = 867

// Breathing room so the chrome never sits flush against a window edge, and so a
// classic (non-overlay) vertical scrollbar can't push it into a horizontal one.
export const SITE_PADDING = 20

// Matches the `@media (max-width: 768px)` blocks in layouts/newsite-template.vue
// and across the newsite components, so the layout's JS and its own CSS can
// never disagree about which mode they are in. Note this is intentionally NOT
// the 767.98px used by composables/useIsNarrow.js, which is pinned to Tailwind's
// `md:` breakpoint instead; see the comment there.
export const MOBILE_QUERY = '(max-width: 768px)'

// Purely defensive. Any width at or above the mobile breakpoint yields at least
// (768 - 20) / 1040 = 0.719, and below that breakpoint no transform is applied
// at all, so this floor is unreachable in practice. It exists so a degenerate
// or zero measurement can never produce a zero, negative, or NaN scale, which
// would collapse or mirror the entire layout.
export const MIN_SITE_SCALE = 0.25

// `availableHeight` is only passed by routes that set `fitHeight: true`; leave
// it undefined for the normal width-only rule.
export function computeSiteScale (availableWidth, availableHeight) {
  let raw = (availableWidth - SITE_PADDING) / SITE_WIDTH
  if (availableHeight !== undefined && availableHeight !== null) {
    const byHeight = (availableHeight - SITE_PADDING) / SITE_HEIGHT
    // A non-finite height must not poison a perfectly good width measurement.
    if (Number.isFinite(byHeight)) raw = Math.min(raw, byHeight)
  }
  if (!Number.isFinite(raw)) return 1
  return Math.min(1, Math.max(MIN_SITE_SCALE, raw))
}

// The scaled chrome still reserves its full unscaled height in layout, because
// `transform` doesn't affect layout boxes. Pull the following content up by the
// difference so a scaled-down site doesn't trail a block of dead space.
export function scaleMarginBottom (scale) {
  return (scale - 1) * SITE_HEIGHT
}
