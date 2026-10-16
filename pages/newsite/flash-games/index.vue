<template>
  <div class="fga">
    <h1 class="fga-title">Flash Arcade</h1>
    <p class="fga-subtitle">
      Classic Flash games, playable again in-browser via
      <a href="https://ruffle.rs" target="_blank" rel="noopener noreferrer" class="fga-link">Ruffle</a>.
    </p>

    <p v-if="loadError" class="fga-error">{{ loadError }}</p>

    <template v-else-if="!loading">
      <div v-if="games.length" class="fga-grid">
        <NuxtLink v-for="g in games" :key="g.id" :to="`/newsite/flash-games/${g.id}`" class="fga-card">
          <div class="fga-thumb">
            <img v-if="g.thumbnailPath" :src="g.thumbnailPath" :alt="g.title" />
            <span v-else class="fga-no-art">{{ g.title }}</span>
          </div>
          <span class="fga-card-title">{{ g.title }}</span>
        </NuxtLink>
      </div>
      <p v-else class="fga-empty">No Flash games have been added yet — check back soon.</p>
    </template>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  title: 'Flash Arcade',
  description: 'Classic Flash games, playable again in-browser via Ruffle.',
  mainContentScrollY: true,
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

const games = ref([])
const loading = ref(true)
const loadError = ref('')

const { data, error } = await useFetch('/api/flash-games')
if (error.value) {
  loadError.value = 'Could not load the Flash Arcade right now.'
} else {
  games.value = data.value?.games || []
}
loading.value = false
</script>

<style scoped>
.fga {
  width: 100%;
  max-width: var(--main-content-width, 900px);
  min-width: 0;
  margin: 0 auto;
  padding: 16px;
  box-sizing: border-box;
  color: #fff;
}
.fga-title { font-size: 1.6rem; font-weight: 800; margin: 0 0 4px; }
.fga-subtitle { font-size: 0.9rem; color: rgba(255, 255, 255, 0.65); margin: 0 0 20px; }
.fga-link { color: #7dd3fc; }
.fga-error, .fga-empty { font-size: 0.9rem; color: rgba(255, 255, 255, 0.65); }

.fga-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.fga-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 10px;
  text-decoration: none;
  color: #fff;
  transition: filter 0.15s ease, transform 0.1s ease;
}
.fga-card:hover { filter: brightness(1.1); transform: scale(1.02); }
.fga-thumb {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}
.fga-thumb img { width: 100%; height: 100%; object-fit: cover; }
.fga-no-art { font-size: 0.8rem; font-weight: 700; padding: 0 8px; color: rgba(255, 255, 255, 0.6); }
.fga-card-title { font-size: 0.85rem; font-weight: 700; word-break: break-word; }
</style>
