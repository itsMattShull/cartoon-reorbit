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
  </div>
</template>

<script setup>
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
// force-reopens the same globally-mounted CMoonSelectModal.vue via the shared composable.
const showJoinCta = ref(false)
// Set only while a rejoin cooldown is actively blocking this user — shown in the button's place
// so the page never looks broken (silently missing the CTA) once eligible.
const cooldownText = ref('')
const { requestOpen } = useCMoonJoinModal()

function goBack() {
  router.push('/newsite/MycWorld')
}

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

onMounted(async () => {
  const [listResult, statusResult] = await Promise.allSettled([
    $fetch('/api/cmoons', { params: { view: 'nav' } }),
    $fetch('/api/cmoon/status'),
  ])
  if (listResult.status === 'fulfilled') {
    cmoons.value = listResult.value?.cmoons || []
  } else {
    error.value = 'Unable to load cMoons right now.'
  }
  if (statusResult.status === 'fulfilled') {
    const status = statusResult.value
    const hasNoCMoon = !!status?.cMoonEnabled && !status.cMoon
    const rejoinAt = status?.cMoonRejoinAvailableAt ? new Date(status.cMoonRejoinAvailableAt) : null
    const inCooldown = !!(rejoinAt && rejoinAt > new Date())
    showJoinCta.value = hasNoCMoon && !inCooldown
    cooldownText.value = (hasNoCMoon && inCooldown) ? `You can rejoin a cMoon on ${dateFormatter.format(rejoinAt)}.` : ''
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
.cmn-page {
  --cmn-accent: #7ec8ff;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 16px;
  overflow-y: auto;
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

/* Short viewports (landscape phones): trim the chrome so the console itself keeps most of the
   available height, matching the pattern in CMoonSelectModal.vue's own short-viewport rule. */
@media (max-height: 700px) {
  .cmn-header { padding: 2px 0 8px; }
  .cmn-footer { margin-top: 10px; }
}
</style>
