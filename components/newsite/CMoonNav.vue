<template>
  <div class="cmn-page">
    <div class="cmn-header">
      <button type="button" class="cmn-back" @click="goBack">← Back</button>
      <h1 class="cmn-title">cMoons</h1>
      <button v-if="showJoinCta" type="button" class="cmn-join-btn" @click="requestOpen">
        Join a cMoon
      </button>
      <p v-else-if="cooldownText" class="cmn-cooldown">{{ cooldownText }}</p>
    </div>

    <div class="cmn-console">
      <div class="cmn-screen">
        <svg
          class="cmn-screen-bg" :viewBox="`0 0 ${SPIRAL_W} ${SPIRAL_H}`"
          preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"
        >
          <rect x="0" y="0" :width="SPIRAL_W" :height="SPIRAL_H" fill="#04211f" />
          <path :d="spiralPath" fill="none" stroke="#5b79c9" :stroke-width="spiralStrokeWidth" stroke-linecap="round" />
        </svg>

        <div v-if="loading" class="cmn-status">Loading…</div>
        <div v-else-if="error" class="cmn-status">{{ error }}</div>
        <div v-else-if="!cmoons.length" class="cmn-status">No cMoons are available yet.</div>

        <!-- auto-fit sizes off the grid's own rendered width (not a viewport media query), so
             this reflows correctly at any container size — including inside `.site-container`'s
             transform:scale() box on desktop, where a viewport-width media query would drift out
             of sync with what's actually rendered. Also naturally handles any cMoon count, from 1
             to many, with no hardcoded slot layout — `.cmn-screen` has no fixed aspect-ratio for
             the same reason: a fixed height would clip a grid that wraps into extra rows once
             there are enough cMoons to need them (verified with 8 cMoons at a 390px viewport). -->
        <div v-else class="cmn-grid">
          <NuxtLink
            v-for="c in cmoons" :key="c.id"
            :to="`/newsite/cmoon/${c.id}`"
            class="cmn-tile"
          >
            <span class="cmn-circle">
              <CMoonAvatar :avatar-path="c.avatarPath" :color="c.color" :name="c.name" />
              <span v-if="c.joinLocked" class="cmn-lock" aria-hidden="true">🔒</span>
            </span>
            <span class="cmn-name">
              {{ c.name }}
              <span v-if="c.joinLocked" class="sr-only">(locked — view only)</span>
            </span>
          </NuxtLink>
        </div>
      </div>
    </div>

    <div class="cmn-footer">
      <div class="cmn-dots" aria-hidden="true"><span class="cmn-dot"></span><span class="cmn-dot"></span><span class="cmn-dot"></span></div>
      <div class="cmn-caption">
        <span class="cmn-caption-logo" aria-hidden="true"></span>
        <span class="cmn-caption-text">Click on the cMoon you want to visit!</span>
      </div>
    </div>

    <!-- Seasonal updates: admin-customizable via Manage Navigation. Section renders even with no
         trackers configured yet (just header + leaderboard + blurb) so there's never a broken
         half-empty state while an admin is still setting it up. -->
    <div v-if="seasonLoaded" class="cmn-season">
      <h2 class="cmn-season-header">{{ season.header }}</h2>

      <div v-if="leaderboard.length" class="cmn-season-panel">
        <h3 class="cmn-season-subheading">Team Leaderboard</h3>
        <div v-for="row in leaderboard" :key="row.id" class="cmn-season-lb-row">
          <span class="cmn-season-lb-rank">{{ row.rank }}</span>
          <span class="cmn-season-lb-swatch" :style="{ background: safeColor(row.color) }"></span>
          <span class="cmn-season-lb-name">{{ row.name }}</span>
          <span class="cmn-season-lb-value">{{ Math.round(row.avgScore).toLocaleString() }} <small>wtd avg</small></span>
        </div>
      </div>

      <div v-for="t in season.trackers" :key="t.id" class="cmn-season-panel">
        <h3 class="cmn-season-subheading">{{ t.label }}</h3>
        <div v-for="p in t.progress" :key="p.cMoonId" class="cmn-season-progress-row">
          <span class="cmn-season-progress-name" :style="{ color: safeColor(p.color) }">{{ p.name }}</span>
          <div class="cmn-season-progress-bar">
            <div class="cmn-season-progress-fill" :style="{ width: progressPercent(p.value, t.targetValue) + '%', background: safeColor(p.color) }"></div>
          </div>
          <span class="cmn-season-progress-value">{{ formatMetricValue(p.value, t.metricType) }} / {{ formatMetricValue(t.targetValue, t.metricType) }}</span>
        </div>
        <p v-if="!t.progress.length" class="cmn-season-empty">No cMoons to track yet.</p>
      </div>

      <div v-if="season.blurb" class="cmn-season-blurb" v-html="season.blurb"></div>
    </div>
  </div>
</template>

<script setup>
import { isSafeCMoonColor } from '~/utils/cmoonColor'

// Recreates the original Cartoon Orbit "click on the world you want to visit" console screen for
// cMoons: a metallic bezel around a screen with a hypnotic swirl background, clickable circles on
// top, and a caption bar below (see the reference screenshots this was built from). Number of
// cMoons is admin-controlled and unbounded, so the circles are a responsive grid (see .cmn-grid
// below) rather than the original's fixed pixel-coordinate slots — it looks right at 1 cMoon or
// 20, on a 320px phone or a desktop.
const router = useRouter()
const loading = ref(true)
const error = ref('')
const cmoons = ref([])
// Whether to show "Join a cMoon" — true for anyone without a cMoon yet, whether they explicitly
// opted out of the join modal or just never saw it (feature disabled, logged out, etc.), AND not
// currently sitting out an admin-configured rejoin cooldown (see cooldownText below). Clicking it
// force-reopens the same globally-mounted CMoonSelectModal.vue via the shared composable. The
// same eligibility rule also backs the "Join a cMoon" button on pages/newsite/settings.vue — see
// composables/useCMoonJoinEligibility.js for the shared logic.
const { showJoinCta, cooldownText, refresh: refreshJoinEligibility } = useCMoonJoinEligibility()
const { requestOpen } = useCMoonJoinModal()

function goBack() {
  router.push('/newsite/MycWorld')
}

// ── Seasonal updates (bottom half, admin-customizable via Manage Navigation) ─────────────────
const seasonLoaded = ref(false)
const season = ref({ header: '', trackers: [], blurb: '' })
const leaderboard = ref([])

function safeColor(color) {
  return isSafeCMoonColor(color) ? color : '#3a4a63'
}

function progressPercent(value, target) {
  if (!target || target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)))
}

// AVG_POINTS is a plain float (see server/utils/cmoonSeason.js) — shown to one decimal so a
// fractional average doesn't look like a typo; every other metric here is always a whole number.
function formatMetricValue(value, metricType) {
  const n = Number(value) || 0
  return metricType === 'AVG_POINTS' ? n.toFixed(1) : Math.round(n).toLocaleString()
}

async function loadSeason() {
  const [seasonResult, leaderboardResult] = await Promise.allSettled([
    $fetch('/api/cmoon-season'),
    $fetch('/api/leaderboard/cmoons'),
  ])
  if (seasonResult.status === 'fulfilled') {
    season.value = seasonResult.value || { header: '', trackers: [], blurb: '' }
  }
  if (leaderboardResult.status === 'fulfilled') {
    leaderboard.value = leaderboardResult.value || []
  }
  // Rendered even if one of the two fetches failed — a season section missing just the
  // leaderboard (or vice versa) is still more useful than hiding the whole thing.
  seasonLoaded.value = true
}

onMounted(async () => {
  const [listResult] = await Promise.allSettled([
    $fetch('/api/cmoons', { params: { view: 'nav' } }),
    refreshJoinEligibility(),
    loadSeason(),
  ])
  if (listResult.status === 'fulfilled') {
    cmoons.value = listResult.value?.cmoons || []
  } else {
    error.value = 'Unable to load cMoons right now.'
  }
  loading.value = false
})

// ── Swirl background ────────────────────────────────────────────────────
// A single Archimedean-spiral stroke on a dark fill reproduces the reference art's two-tone
// hypnotic swirl exactly (the "gap" between coils IS the dark background showing through — no
// second path needed). Computed once at module scope, not per-render: it's a fixed decorative
// shape with no reactive inputs, and the same viewBox/path is shared by every instance of this
// component. `preserveAspectRatio="xMidYMid slice"` on the <svg> lets it fill and crop correctly
// however tall `.cmn-screen` ends up being, since that height is content-driven (see the
// `.cmn-screen` comment above) rather than a fixed aspect ratio.
const SPIRAL_W = 900
const SPIRAL_H = 530

function buildSpiralPath(cx, cy, r0, rMax, turns, stepDeg) {
  const thetaMax = turns * 2 * Math.PI
  const b = (rMax - r0) / thetaMax
  const step = (stepDeg * Math.PI) / 180
  let d = ''
  for (let theta = 0; theta <= thetaMax; theta += step) {
    const r = r0 + b * theta
    const x = cx + r * Math.cos(theta)
    const y = cy + r * Math.sin(theta)
    d += (theta === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2) + ' '
  }
  return { d, pitch: 2 * Math.PI * b }
}

const rMax = Math.hypot(SPIRAL_W, SPIRAL_H) / 2 // overflows the viewBox on purpose, cropped by the rounded screen corners
const spiral = buildSpiralPath(SPIRAL_W / 2, SPIRAL_H / 2, 6, rMax, 7, 2)
const spiralPath = spiral.d
const spiralStrokeWidth = (spiral.pitch * 0.52).toFixed(2)
</script>

<style scoped>
/* No independent height/overflow here — the page opts into mainContentScrollY (see
   pages/newsite/cmoon-nav.vue's own comment), which makes the ancestor .main-content the real
   scroll container. This used to be `height: 100%; overflow-y: auto`, its own SECOND scroll box
   nested inside that one — harmless while the console was short enough to never need to scroll,
   but the season section below made the page tall enough that content was getting clipped inside
   this shorter inner box instead of reaching the outer scrollbar. Same fix pages/newsite/
   tutorial.vue's own .tutorial rule documents for the identical nested-scroll trap. */
.cmn-page {
  --cmn-accent: #7ec8ff;
  width: 100%;
  box-sizing: border-box;
  padding: 16px;
  color: #fff;
  font-family: 'Nunito', sans-serif;
}

.cmn-header {
  position: relative;
  text-align: center;
  padding: 4px 0 14px;
}

.cmn-back {
  position: absolute;
  left: 0;
  top: 0;
  min-height: 44px;
  padding: 0 10px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}
.cmn-back:hover,
.cmn-back:focus-visible {
  color: #fff;
}
.cmn-back:focus-visible {
  outline: 3px solid #ffd75e;
  outline-offset: 2px;
}

.cmn-title {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

/* Metallic bezel — `position: relative`/`absolute` only, never `position: fixed` anywhere in this
   component. `.site-container` in layouts/newsite-template.vue applies `transform: scale()` even
   at scale(1), which makes it the containing block for any fixed-position descendant, so a
   fixed-position element in here would render at the wrong size/place on desktop. */
.cmn-console {
  position: relative;
  border-radius: 28px;
  padding: 12px;
  background: linear-gradient(160deg, #6b6f75 0%, #2a2c30 18%, #101113 45%, #2a2c30 75%, #75797f 100%);
  box-shadow:
    inset 0 2px 4px rgba(255, 255, 255, 0.25),
    inset 0 -6px 14px rgba(0, 0, 0, 0.6),
    0 10px 30px rgba(0, 0, 0, 0.35);
}

.cmn-screen {
  position: relative;
  border-radius: 20px;
  overflow: hidden;
  border: 5px solid #bcdcf5;
  box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.55);
  /* Intentionally no fixed aspect-ratio here — with overflow:hidden, a fixed-ratio height would
     clip a grid that needs more rows than the ratio has space for (verified: 8 cMoons on a 390px
     viewport overflowed a 16/9.4 ratio box top and bottom before this was changed to min-height +
     auto). Few cMoons still get a reasonable minimum height via the clamp() below instead. */
  min-height: clamp(220px, 34vw, 340px);
}

.cmn-screen-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.cmn-join-btn {
  margin: 12px auto 0;
  display: block;
  min-height: 44px;
  padding: 0 20px;
  border: none;
  border-radius: 8px;
  background: #256e45;
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}
@media (hover: hover) and (pointer: fine) {
  .cmn-join-btn:hover { background: #2e8b57; }
}
.cmn-join-btn:focus-visible {
  outline: 3px solid #ffd75e;
  outline-offset: 2px;
}

.cmn-cooldown {
  margin: 12px 0 0;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.65);
}

.cmn-status {
  position: relative;
  z-index: 1;
  padding: 32px 8px;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

.cmn-grid {
  position: relative;
  z-index: 1;
  min-height: 100%;
  display: grid;
  align-content: center;
  /* auto-fit + minmax, same technique as CMoonSelectModal.vue's .cms-options — column count
     falls out of the actual rendered width, no breakpoint bookkeeping needed. */
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 18px 10px;
  justify-items: center;
  padding: 24px;
}

.cmn-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  max-width: 130px;
  min-height: 44px;
  padding: 6px 4px;
  border-radius: 12px;
  text-decoration: none;
  color: #fff;
  /* Keeps every state (rest/hover/focus) on the same cheap properties — no per-frame box-shadow
     blur growth, which is the jank-prone part of a "glow" effect on low-end mobile GPUs. */
  transition: transform 0.15s ease;
}

.cmn-circle {
  position: relative;
  width: 78px;
  height: 78px;
  border-radius: 50%;
  border: 4px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.45);
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}

.cmn-name {
  font-size: 0.78rem;
  font-weight: 800;
  text-align: center;
  word-break: break-word;
  line-height: 1.15;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.cmn-lock {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #1a2f4d;
  border: 2px solid #061224;
  font-size: 0.8rem;
}

/* Hover highlight only for devices that actually have a real mouse — otherwise touch devices get
   a "sticky hover" that never clears until a second tap elsewhere. */
@media (hover: hover) and (pointer: fine) {
  .cmn-tile:hover .cmn-circle {
    border-color: var(--cmn-accent);
    box-shadow: 0 0 18px 4px rgba(126, 200, 255, 0.65);
  }
  .cmn-tile:hover {
    transform: translateY(-2px);
  }
}

/* Focus gets the same highlight as hover, so keyboard users get an equivalent affordance rather
   than relying on the default outline alone. */
.cmn-tile:focus-visible {
  outline: 3px solid #ffd75e;
  outline-offset: 3px;
  transform: translateY(-2px);
}
.cmn-tile:focus-visible .cmn-circle {
  border-color: var(--cmn-accent);
  box-shadow: 0 0 18px 4px rgba(126, 200, 255, 0.65);
}

.cmn-footer {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 14px;
}

.cmn-dots {
  display: flex;
  gap: 8px;
  padding-left: 4px;
  flex-shrink: 0;
}
.cmn-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #baffc9, #26b24a 60%, #0c6b23);
  box-shadow: 0 0 6px rgba(60, 255, 120, 0.7);
}

.cmn-caption {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 3px solid #cfd8e3;
  border-radius: 14px;
  padding: 8px 14px;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25);
}

.cmn-caption-logo {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
  background: radial-gradient(circle at 35% 30%, #7ec8ff, #1a5a9a 70%);
}

.cmn-caption-text {
  color: #0a3d91;
  font-weight: 800;
  font-size: 0.9rem;
  line-height: 1.15;
}

/* ── Seasonal updates (admin-customizable via Manage Navigation) ──────────────────────────── */
.cmn-season {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
}

.cmn-season-header {
  margin: 0 0 14px;
  font-size: 1.2rem;
  font-weight: 800;
  text-align: center;
}

.cmn-season-panel {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 12px;
}

.cmn-season-subheading {
  margin: 0 0 8px;
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--cmn-accent);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.cmn-season-empty {
  margin: 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.55);
}

.cmn-season-lb-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: 0.82rem;
}
.cmn-season-lb-row + .cmn-season-lb-row { border-top: 1px solid rgba(255, 255, 255, 0.08); }
.cmn-season-lb-rank {
  width: 18px;
  flex-shrink: 0;
  text-align: center;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.55);
}
.cmn-season-lb-swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.3);
}
.cmn-season-lb-name {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.cmn-season-lb-value {
  flex-shrink: 0;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.cmn-season-lb-value small {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.7rem;
}

.cmn-season-progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
}
.cmn-season-progress-name {
  width: 90px;
  flex-shrink: 0;
  font-size: 0.78rem;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cmn-season-progress-bar {
  flex: 1;
  min-width: 0;
  height: 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
.cmn-season-progress-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s ease;
}
.cmn-season-progress-value {
  flex-shrink: 0;
  width: 88px;
  text-align: right;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.75);
}

/* Same hand-written prose rhythm as .tutorial-prose (pages/newsite/tutorial.vue) — this blurb is
   explicitly meant to share that page's aesthetic. No @tailwindcss/typography plugin in this app. */
.cmn-season-blurb {
  font-size: 0.95rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.85);
  overflow-wrap: anywhere;
  word-break: break-word;
}
.cmn-season-blurb :deep(p) { margin: 0 0 0.75em; }
.cmn-season-blurb :deep(p:last-child) { margin-bottom: 0; }
.cmn-season-blurb :deep(h2),
.cmn-season-blurb :deep(h3),
.cmn-season-blurb :deep(h4) {
  font-weight: 700;
  color: #fff;
  margin: 1em 0 0.4em;
}
.cmn-season-blurb :deep(h2:first-child),
.cmn-season-blurb :deep(h3:first-child),
.cmn-season-blurb :deep(h4:first-child) { margin-top: 0; }
.cmn-season-blurb :deep(ul),
.cmn-season-blurb :deep(ol) {
  margin: 0 0 0.75em;
  padding-left: 1.25em;
}
.cmn-season-blurb :deep(li) { margin: 0.25em 0; }
.cmn-season-blurb :deep(a) {
  color: var(--OrbitLightBlue, #3399CC);
  text-decoration: underline;
}
.cmn-season-blurb :deep(blockquote) {
  border-left: 3px solid rgba(255, 255, 255, 0.25);
  margin: 0 0 0.75em;
  padding-left: 0.75em;
  color: rgba(255, 255, 255, 0.65);
}

/* Short viewports (landscape phones): trim the chrome so the console itself keeps most of the
   available height, matching the pattern in CMoonSelectModal.vue's own short-viewport rule. */
@media (max-height: 700px) {
  .cmn-header { padding: 2px 0 8px; }
  .cmn-footer { margin-top: 10px; }
}
</style>
