<template>
  <div class="earnpoints-content">
    <img v-if="earnPointsImagePath" :src="earnPointsImagePath" alt="Earn Points" class="earnpoints-image" />
    <div v-else class="earnpoints-placeholder"></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'Earn Points',
  description: 'Discover all the ways to earn points on Cartoon ReOrbit, from daily visits to games and contests, and grow your cToon collection.'
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()
useHead({ htmlAttrs: { class: 'newsite-earnpoints' } })

const earnPointsImagePath = ref(null)

onMounted(async () => {
  try {
    const cfg = await $fetch('/api/homepage')
    earnPointsImagePath.value = cfg.earnPointsImagePath || null
  } catch {}
})
</script>

<style>
html.newsite-earnpoints {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat fixed !important;
}

html.newsite-earnpoints body {
  background: transparent !important;
  min-height: 100vh;
}
</style>

<style scoped>
.earnpoints-content {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 4px;
  box-sizing: border-box;
}

.earnpoints-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

.earnpoints-placeholder {
  width: 100%;
  height: 100%;
}
</style>
