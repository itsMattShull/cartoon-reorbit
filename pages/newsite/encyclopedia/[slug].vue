<template>
  <div class="encyclopedia">
    <template v-if="entry">
      <img
        v-if="entry.heroImagePath"
        :src="entry.heroImagePath"
        alt=""
        loading="eager"
        fetchpriority="high"
        class="encyclopedia-hero"
      />

      <NuxtLink to="/newsite/encyclopedia" class="encyclopedia-back">← Encyclopedia</NuxtLink>
      <h1 class="encyclopedia-entry-title">{{ entry.title }}</h1>

      <div class="encyclopedia-prose" v-html="entry.body" @click="onProseClick"></div>
    </template>

    <template v-else>
      <NuxtLink to="/newsite/encyclopedia" class="encyclopedia-back">← Encyclopedia</NuxtLink>
      <h1 class="encyclopedia-entry-title">Entry not found</h1>
      <p class="encyclopedia-error">This entry doesn't exist, or is no longer available.</p>
    </template>
  </div>
</template>

<script setup>
const route = useRoute()
const router = useRouter()

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'Encyclopedia',
  mainContentScrollY: true,
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()
useHead({ htmlAttrs: { class: 'newsite-encyclopedia' } })

const slug = computed(() => {
  const raw = route.params.slug
  return typeof raw === 'string' ? raw : (Array.isArray(raw) ? raw[0] : '')
})

const { data } = await useFetch(() => `/api/encyclopedia/${slug.value}`, {
  watch: [slug],
  // A missing/inactive entry is an expected 404, not an error to surface in the console —
  // handled below by falling back to the "not found" template branch.
  onResponseError: () => {},
})
const entry = computed(() => data.value || null)

useHead({ title: computed(() => entry.value ? `${entry.value.title} | Encyclopedia | Cartoon ReOrbit` : 'Encyclopedia | Cartoon ReOrbit') })

// Sanitized body HTML lands here via v-html, not NuxtLink, so a link to another entry is a plain
// <a> that would otherwise trigger a full page reload. Intercepting only the exact internal-entry
// shape sanitizeEncyclopediaHtml.js allows keeps every other link (external, mailto) behaving
// normally — a full navigation, same as the Tutorial page's own links.
function onProseClick(event) {
  const link = event.target.closest('a')
  if (!link) return
  const href = link.getAttribute('href') || ''
  if (!href.startsWith('/newsite/encyclopedia/')) return
  event.preventDefault()
  router.push(href)
}
</script>

<style>
html.newsite-encyclopedia {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat fixed !important;
}

html.newsite-encyclopedia body {
  background: transparent !important;
  min-height: 100vh;
}
</style>

<style scoped>
.encyclopedia {
  width: 100%;
  max-width: var(--main-content-width, 800px);
  min-width: 0;
  margin: 0 auto;
  padding: 16px;
  box-sizing: border-box;
  color: #fff;
}

/* Free-form, not a banner: any image, any aspect ratio, shown whole — no forced aspect-ratio box
   and no object-fit crop (the server no longer forces one either, see the image upload
   endpoint's own comment). max-width/height just keeps an oversized upload from overwhelming the
   page; width/height:auto means it never gets stretched past (or squashed to fit) its own
   natural proportions. */
.encyclopedia-hero {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 480px;
  border-radius: 8px;
  margin: 0 auto 16px;
}

.encyclopedia-back {
  display: inline-block;
  font-size: 0.8rem;
  color: var(--OrbitLightBlue, #3399CC);
  text-decoration: none;
  margin-bottom: 8px;
}
.encyclopedia-back:hover { text-decoration: underline; }

.encyclopedia-entry-title {
  font-size: 1.6rem;
  font-weight: 800;
  margin: 0 0 16px;
}

.encyclopedia-error {
  color: rgba(255, 255, 255, 0.65);
  font-size: 0.9rem;
}

/* Same hand-written prose rhythm as .tutorial-prose (pages/newsite/tutorial.vue) — no
   @tailwindcss/typography plugin in this app. */
.encyclopedia-prose {
  font-size: 0.95rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.85);
  overflow-wrap: anywhere;
  word-break: break-word;
}
.encyclopedia-prose :deep(p) { margin: 0 0 0.75em; }
.encyclopedia-prose :deep(p:last-child) { margin-bottom: 0; }
.encyclopedia-prose :deep(h2),
.encyclopedia-prose :deep(h3),
.encyclopedia-prose :deep(h4) {
  font-weight: 700;
  color: #fff;
  margin: 1em 0 0.4em;
}
.encyclopedia-prose :deep(h2:first-child),
.encyclopedia-prose :deep(h3:first-child),
.encyclopedia-prose :deep(h4:first-child) { margin-top: 0; }
.encyclopedia-prose :deep(ul),
.encyclopedia-prose :deep(ol) {
  margin: 0 0 0.75em;
  padding-left: 1.25em;
}
.encyclopedia-prose :deep(li) { margin: 0.25em 0; }
.encyclopedia-prose :deep(a) {
  color: var(--OrbitLightBlue, #3399CC);
  text-decoration: underline;
  padding: 0.1em 0;
  display: inline-block;
  min-height: 1.4em;
}
.encyclopedia-prose :deep(blockquote) {
  border-left: 3px solid rgba(255, 255, 255, 0.25);
  margin: 0 0 0.75em;
  padding-left: 0.75em;
  color: rgba(255, 255, 255, 0.65);
}
</style>
