<template>
  <div class="fgp">
    <NuxtLink to="/newsite/flash-games" class="fgp-back">&larr; Flash Arcade</NuxtLink>

    <p v-if="loadError" class="fgp-error">{{ loadError }}</p>
    <template v-else-if="!loading && game">
      <h1 class="fgp-title">{{ game.title }}</h1>
      <p v-if="game.description" class="fgp-desc">{{ game.description }}</p>
      <div class="fgp-stage">
        <RufflePlayer :src="game.swfPath" />
      </div>
    </template>
  </div>
</template>

<script setup>
const route = useRoute()

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  title: route => `Flash Arcade`,
  description: 'Play a classic Flash game in-browser via Ruffle.',
  mainContentScrollY: true,
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

const game = ref(null)
const loading = ref(true)
const loadError = ref('')

const { data, error } = await useFetch(`/api/flash-games/${route.params.id}`)
if (error.value) {
  loadError.value = error.value?.statusCode === 404 ? 'This game could not be found.' : 'Could not load this game right now.'
} else {
  game.value = data.value?.game || null
}
loading.value = false
</script>

<style scoped>
.fgp {
  width: 100%;
  max-width: var(--main-content-width, 900px);
  min-width: 0;
  margin: 0 auto;
  padding: 16px;
  box-sizing: border-box;
  color: #fff;
}
.fgp-back {
  display: inline-block;
  font-size: 0.85rem;
  color: #7dd3fc;
  text-decoration: none;
  margin-bottom: 12px;
}
.fgp-back:hover { text-decoration: underline; }
.fgp-error { font-size: 0.9rem; color: rgba(255, 255, 255, 0.65); }
.fgp-title { font-size: 1.4rem; font-weight: 800; margin: 0 0 4px; }
.fgp-desc { font-size: 0.85rem; color: rgba(255, 255, 255, 0.65); margin: 0 0 16px; }
.fgp-stage {
  width: 100%;
  aspect-ratio: 4 / 3;
  max-height: 70vh;
  background: #000;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  overflow: hidden;
}
</style>
