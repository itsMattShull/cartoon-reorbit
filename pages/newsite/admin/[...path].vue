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
