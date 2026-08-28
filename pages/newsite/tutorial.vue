<template>
  <div class="tutorial-wrap">
    <div class="tutorial-card">
      <img
        v-if="heroImagePath"
        :src="heroImagePath"
        alt=""
        width="800"
        height="800"
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
  description: 'New to Cartoon ReOrbit? Learn how auctions, trading, cMoons, cMart, games, and cWorld work, plus how to earn points every day.'
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
.tutorial-wrap {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 12px;
}

.tutorial-card {
  max-width: 46rem;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.97);
  border-radius: 10px;
  padding: 16px;
  box-sizing: border-box;
}

/* Reserve space up front (no CLS) and never let an 800x800 asset overflow a
   narrow phone viewport. */
.tutorial-hero {
  display: block;
  width: 100%;
  max-width: 800px;
  height: auto;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 8px;
  margin: 0 auto 16px;
}

.tutorial-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 4px;
}

.tutorial-subtitle {
  font-size: 0.9rem;
  color: #6b7280;
  margin: 0 0 16px;
}

.tutorial-sections {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tutorial-section {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.tutorial-section-summary {
  cursor: pointer;
  list-style: none;
  padding: 12px 14px;
  font-weight: 600;
  font-size: 1rem;
  color: #1f2937;
  background: #f9fafb;
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
  padding: 12px 14px 16px;
}

/* No @tailwindcss/typography plugin in this app — hand-written prose rhythm
   for whatever bold/list/heading markup the rich-text editor produces. */
.tutorial-prose {
  font-size: 0.95rem;
  line-height: 1.6;
  color: #374151;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.tutorial-prose :deep(p) { margin: 0 0 0.75em; }
.tutorial-prose :deep(p:last-child) { margin-bottom: 0; }
.tutorial-prose :deep(h2),
.tutorial-prose :deep(h3),
.tutorial-prose :deep(h4) {
  font-weight: 700;
  color: #111827;
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
  color: #4f46e5;
  text-decoration: underline;
  padding: 0.1em 0;
  display: inline-block;
  min-height: 1.4em;
}
.tutorial-prose :deep(blockquote) {
  border-left: 3px solid #d1d5db;
  margin: 0 0 0.75em;
  padding-left: 0.75em;
  color: #6b7280;
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
  background: #eef2ff;
  border-radius: 8px;
  padding: 12px 10px;
}
.tutorial-points-num {
  font-size: 1.5rem;
  font-weight: 800;
  color: #4338ca;
}
.tutorial-points-label {
  font-size: 0.75rem;
  color: #4338ca;
  margin-top: 2px;
}
</style>
