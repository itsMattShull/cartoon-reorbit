<template>
  <div class="tutorial">
    <img
      v-if="heroImagePath"
      :src="heroImagePath"
      alt=""
      width="200"
      height="200"
      loading="eager"
      fetchpriority="high"
      class="tutorial-hero"
    />

    <h1 class="tutorial-title">How to Play</h1>
    <p class="tutorial-subtitle">A quick guide to everything Cartoon ReOrbit has to offer.</p>

    <div class="tutorial-sections">
      <details
        v-for="(meta, i) in SECTION_META"
        :key="meta.key"
        class="tutorial-section"
        :open="i === 0"
      >
        <summary class="tutorial-section-summary">{{ meta.label }}</summary>
        <div class="tutorial-section-body">
          <div class="tutorial-prose" v-html="sections[meta.key]"></div>

          <div v-if="meta.key === 'points'" class="tutorial-points-stats">
            <div class="tutorial-points-stat">
              <span class="tutorial-points-num">{{ dailyLoginPoints }}</span>
              <span class="tutorial-points-label">points / day for returning players</span>
            </div>
            <div class="tutorial-points-stat">
              <span class="tutorial-points-num">{{ dailyNewUserPoints }}</span>
              <span class="tutorial-points-label">points / day for new players (first 7 days)</span>
            </div>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { SECTION_META } from '@/utils/tutorialSections'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'How to Play',
  description: 'New to Cartoon ReOrbit? Learn how auctions, trading, cMoons, cMart, games, and cWorld work, plus how to earn points every day.',
  // The fixed-chrome `.main-content` box is `overflow: hidden` by default
  // (layouts/newsite-template.vue) — nine expandable sections plus a hero
  // image can push this well past that fixed height (same reasoning as
  // pages/newsite/cmoon-nav.vue).
  mainContentScrollY: true
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()
useHead({ htmlAttrs: { class: 'newsite-tutorial' } })

const { data: tutorialData } = await useFetch('/api/tutorial')
const { data: globalConfig } = await useFetch('/api/global-config')

const heroImagePath = computed(() => tutorialData.value?.heroImagePath || null)
const sections = computed(() => tutorialData.value?.sections || {})
const dailyLoginPoints = computed(() => globalConfig.value?.dailyLoginPoints ?? 500)
const dailyNewUserPoints = computed(() => globalConfig.value?.dailyNewUserPoints ?? 1000)
</script>

<style>
html.newsite-tutorial {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat fixed !important;
}

html.newsite-tutorial body {
  background: transparent !important;
  min-height: 100vh;
}
</style>

<style scoped>
/* Single container directly on the page's own dark gradient (set below) —
   matches every other newsite page component (.economy, .ah, .cmart,
   .all-ctoons): no separate opaque "card" layered on top of it. Fluid like
   .economy too: on desktop .main-content is a fixed var(--main-content-width)
   box so this still resolves to 800px, while at <=768px .main-content
   switches to width:100% + overflow-x:auto, and a fixed width here would
   leave the page half off-screen behind a horizontal pan.
   mainContentScrollY (page meta) makes the ancestor .main-content the real
   scroll container — no independent height/overflow here, or content gets
   clipped inside a second, shorter scroll box nested in the real one. */
.tutorial {
  width: 100%;
  max-width: var(--main-content-width, 800px);
  min-width: 0;
  margin: 0 auto;
  padding: 16px;
  box-sizing: border-box;
  color: #fff;
}

/* Reserve space up front (no CLS) and never let a 200x200 asset overflow a
   narrow phone viewport. */
.tutorial-hero {
  display: block;
  width: 100%;
  max-width: 200px;
  height: auto;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 8px;
  margin: 0 auto 16px;
}

.tutorial-title {
  font-size: 1.6rem;
  font-weight: 800;
  margin: 0 0 4px;
}

.tutorial-subtitle {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.65);
  margin: 0 0 16px;
}

.tutorial-sections {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tutorial-section {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  overflow: hidden;
}

.tutorial-section-summary {
  cursor: pointer;
  list-style: none;
  padding: 12px 14px;
  font-weight: 600;
  font-size: 1rem;
  color: #fff;
  user-select: none;
}
.tutorial-section-summary::-webkit-details-marker { display: none; }
.tutorial-section-summary::before {
  content: '▸';
  display: inline-block;
  margin-right: 8px;
  transition: transform 0.15s ease;
}
.tutorial-section[open] > .tutorial-section-summary::before {
  transform: rotate(90deg);
}

.tutorial-section-body {
  padding: 0 14px 16px;
}

/* No @tailwindcss/typography plugin in this app — hand-written prose rhythm
   for whatever bold/list/heading markup the rich-text editor produces. */
.tutorial-prose {
  font-size: 0.95rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.85);
  overflow-wrap: anywhere;
  word-break: break-word;
}
.tutorial-prose :deep(p) { margin: 0 0 0.75em; }
.tutorial-prose :deep(p:last-child) { margin-bottom: 0; }
.tutorial-prose :deep(h2),
.tutorial-prose :deep(h3),
.tutorial-prose :deep(h4) {
  font-weight: 700;
  color: #fff;
  margin: 1em 0 0.4em;
}
.tutorial-prose :deep(h2:first-child),
.tutorial-prose :deep(h3:first-child),
.tutorial-prose :deep(h4:first-child) { margin-top: 0; }
.tutorial-prose :deep(ul),
.tutorial-prose :deep(ol) {
  margin: 0 0 0.75em;
  padding-left: 1.25em;
}
.tutorial-prose :deep(li) { margin: 0.25em 0; }
.tutorial-prose :deep(a) {
  color: var(--OrbitLightBlue, #3399CC);
  text-decoration: underline;
  padding: 0.1em 0;
  display: inline-block;
  min-height: 1.4em;
}
.tutorial-prose :deep(blockquote) {
  border-left: 3px solid rgba(255, 255, 255, 0.25);
  margin: 0 0 0.75em;
  padding-left: 0.75em;
  color: rgba(255, 255, 255, 0.65);
}

.tutorial-points-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.tutorial-points-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 12px 10px;
}
.tutorial-points-num {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--OrbitLightBlue, #3399CC);
}
.tutorial-points-label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.75);
  margin-top: 2px;
}
</style>
