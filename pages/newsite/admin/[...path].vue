<template>
  <div class="newsite-admin">
    <AdminNav
      :sections="navTree"
      :active-key="section?.key"
      v-model:open="navOpen"
    />

    <div class="newsite-admin-body">
      <Suspense>
        <component
          :is="activeComponent"
          :key="section.key"
          :sub-path="subPath"
        />
        <template #fallback>
          <div class="newsite-admin-loading">Loading {{ section.label }}…</div>
        </template>
      </Suspense>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, shallowRef, watch, defineAsyncComponent } from 'vue'
import { adminNavTree, resolveAdminRoute } from '~/utils/adminSections'

definePageMeta({
  layout: 'newsite-template',
  middleware: ['newsite', 'admin'],
  // The admin console opts out of the fixed 1040x862 scaled chrome. That
  // container is a `transform: scale()` ancestor, which makes it the containing
  // block for every `position: fixed` modal inside it (and then clips them via
  // `overflow: hidden`), and it decouples viewport media queries from the real
  // content width. Admin tools need normal viewport semantics.
  fluidLayout: true,
  showAdbar: false,
  showFooter: false,
  showSidebar: false,
  showNav: true,
  title: 'Admin',
  description: 'Cartoon ReOrbit administration tools.',
  robots: 'noindex, nofollow'
})
useHead({ htmlAttrs: { class: 'newsite-admin-page' } })

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

const route = useRoute()
const navTree = adminNavTree()
const navOpen = ref(false)

const resolved = computed(() => resolveAdminRoute(route.params.path))

// An unknown section 404s rather than rendering an empty shell: it keeps the
// tool inventory from being enumerable by URL, and a typo fails loudly.
if (!resolved.value) {
  throw createError({ statusCode: 404, statusMessage: 'Unknown admin section', fatal: true })
}

const section = computed(() => resolved.value?.section ?? null)
const subPath = computed(() => resolved.value?.subPath ?? [])

// Async components are memoised per section key so navigating away and back
// does not build a second wrapper (and so the chunk is fetched once).
const cache = new Map()
const activeComponent = shallowRef(null)

function selectComponent (sec) {
  if (!sec) return
  if (!cache.has(sec.key)) cache.set(sec.key, defineAsyncComponent(sec.load))
  activeComponent.value = cache.get(sec.key)
}
selectComponent(section.value)

watch(section, (sec, prev) => {
  if (!sec) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown admin section', fatal: true })
  }
  if (sec.key !== prev?.key) selectComponent(sec)
  navOpen.value = false
})
</script>

<style>
html.newsite-admin-page {
  min-height: 100vh;
  /* `background-attachment: fixed` forces a full-viewport repaint on every
     scroll frame in mobile Safari, on a page that can scroll thousands of
     pixels. Scroll-attached with a fixed min-height looks identical. */
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat !important;
  background-size: 100% 100% !important;
}

html.newsite-admin-page body {
  background: transparent !important;
  min-height: 100vh;
}

/* ── Admin-wide mobile rules ───────────────────────────────────────────────
   Applied once here rather than edited into ~60 section components. The admin
   UI is deliberately dense (text-xs / py-0.5 everywhere), which is right on a
   desktop and unusable on a touch screen. */

/* iOS Safari zooms the page whenever a focused input's font-size is under 16px,
   and it does not zoom back out. The admin is wall-to-wall filter inputs, so
   without this every tap on a filter leaves the page zoomed in. Scoped to
   coarse pointers so desktop keeps its dense sizing. */
@media (max-width: 767.98px) and (pointer: coarse) {
  .newsite-admin input:not([type='checkbox']):not([type='radio']),
  .newsite-admin select,
  .newsite-admin textarea {
    font-size: 16px !important;
  }
}

/* 44px minimum touch target. The dense `py-0.5` + `text-xs` controls render at
   roughly 20px, which is a third of the recommended size. */
@media (pointer: coarse) {
  .newsite-admin button,
  .newsite-admin a[href],
  .newsite-admin input:not([type='checkbox']):not([type='radio']),
  .newsite-admin select {
    min-height: 44px;
  }

  .newsite-admin input[type='checkbox'],
  .newsite-admin input[type='radio'] {
    min-width: 24px;
    min-height: 24px;
  }
}

/* Any table wide enough to overflow its section gets its own horizontal
   scroller instead of being clipped. Many legacy tools have 9-17 column tables
   with no `overflow-x-auto` wrapper of their own. */
.newsite-admin table {
  max-width: 100%;
}

.newsite-admin .overflow-x-auto,
.newsite-admin-body {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
}

/* Legacy tools were authored as full-page views centred in a browser window.
   Inside the console panel their centring gutters just waste width. */
@media (max-width: 767.98px) {
  .newsite-admin .max-w-2xl,
  .newsite-admin .max-w-4xl,
  .newsite-admin .max-w-6xl,
  .newsite-admin .max-w-7xl {
    max-width: 100%;
  }

  .newsite-admin .p-6 { padding: 0.75rem; }
}
</style>

<style scoped>
.newsite-admin {
  display: grid;
  grid-template-columns: var(--admin-rail-width, 208px) minmax(0, 1fr);
  width: 100%;
  min-height: 0;
  height: 100%;
  box-sizing: border-box;
}

.newsite-admin-body {
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  /* auto, not hidden: a table wider than the panel must stay reachable rather
     than being silently amputated. */
  overflow-x: auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: #f9fafb;
}

.newsite-admin-loading {
  padding: 24px;
  color: #4b5563;
  font-size: 0.85rem;
}

@media (max-width: 767.98px) {
  .newsite-admin {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }
}
</style>
