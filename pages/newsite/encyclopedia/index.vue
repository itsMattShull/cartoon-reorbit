<template>
  <div class="encyclopedia">
    <h1 class="encyclopedia-title">Encyclopedia</h1>
    <p class="encyclopedia-subtitle">A reference guide to everything Cartoon ReOrbit.</p>

    <div class="encyclopedia-search">
      <input
        v-model="query"
        type="text"
        class="encyclopedia-search-input"
        placeholder="Search the encyclopedia…"
        autocomplete="off"
        role="combobox"
        :aria-expanded="suggestions.length > 0"
        @keydown.esc="query = ''"
      />
      <div v-if="suggestions.length" class="encyclopedia-suggestions">
        <NuxtLink
          v-for="s in suggestions" :key="s.slug"
          :to="`/newsite/encyclopedia/${s.slug}`"
          class="encyclopedia-suggestion"
          @click="query = ''"
        >{{ s.title }}</NuxtLink>
      </div>
    </div>

    <p v-if="loadError" class="encyclopedia-error">{{ loadError }}</p>

    <div v-else-if="entries.length" class="encyclopedia-grid">
      <NuxtLink v-for="e in entries" :key="e.slug" :to="`/newsite/encyclopedia/${e.slug}`" class="encyclopedia-card">
        <div class="encyclopedia-card-thumb">
          <img v-if="e.heroImagePath" :src="e.heroImagePath" alt="" loading="lazy" />
        </div>
        <span class="encyclopedia-card-title">{{ e.title }}</span>
      </NuxtLink>
    </div>

    <p v-else-if="!loading" class="encyclopedia-empty">No entries yet — check back soon.</p>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'Encyclopedia',
  description: 'A searchable reference guide to Cartoon ReOrbit — cMoons, games, features, and more.',
  // Same reasoning as pages/newsite/tutorial.vue: a search box plus a growing entry grid can
  // exceed the fixed-chrome .main-content box's default height.
  mainContentScrollY: true,
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()
useHead({ htmlAttrs: { class: 'newsite-encyclopedia' } })

const entries = ref([])
const loading = ref(true)
const loadError = ref('')
const query = ref('')

const suggestions = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return entries.value.filter(e => e.title.toLowerCase().includes(q)).slice(0, 8)
})

const { data, error } = await useFetch('/api/encyclopedia/entries')
if (error.value) {
  loadError.value = 'Could not load the encyclopedia right now.'
} else {
  entries.value = data.value?.entries || []
}
loading.value = false
</script>

<style>
/* Identical gradient to html.newsite-tutorial (pages/newsite/tutorial.vue) — this page is
   explicitly meant to share that page's aesthetic. */
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

.encyclopedia-title {
  font-size: 1.6rem;
  font-weight: 800;
  margin: 0 0 4px;
}

.encyclopedia-subtitle {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.65);
  margin: 0 0 16px;
}

.encyclopedia-search {
  position: relative;
  margin-bottom: 20px;
}
.encyclopedia-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 14px;
  font-size: 16px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
.encyclopedia-search-input::placeholder { color: rgba(255, 255, 255, 0.45); }
.encyclopedia-search-input:focus {
  outline: none;
  border-color: var(--OrbitLightBlue, #3399CC);
}

.encyclopedia-suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 20;
  background: #062a4a;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.encyclopedia-suggestion {
  display: block;
  padding: 9px 14px;
  font-size: 0.9rem;
  color: #fff;
  text-decoration: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.encyclopedia-suggestion:last-child { border-bottom: none; }
.encyclopedia-suggestion:hover,
.encyclopedia-suggestion:focus { background: rgba(255, 255, 255, 0.1); }

.encyclopedia-error,
.encyclopedia-empty {
  color: rgba(255, 255, 255, 0.65);
  font-size: 0.9rem;
}

.encyclopedia-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.encyclopedia-card {
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  overflow: hidden;
  text-decoration: none;
  color: #fff;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.encyclopedia-card:hover,
.encyclopedia-card:focus {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}
.encyclopedia-card-thumb {
  width: 100%;
  aspect-ratio: 4 / 2;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.encyclopedia-card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.encyclopedia-card-title {
  padding: 8px 10px;
  font-size: 0.85rem;
  font-weight: 600;
}
</style>
