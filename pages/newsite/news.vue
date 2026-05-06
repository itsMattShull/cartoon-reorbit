<template>
  <NuxtLayout name="newsite-template">
    <template #sidebar-top>
      <UserInfo />
    </template>
    <template #sidebar-bottom>
      <WinballAd />
    </template>
    <template #main-content>
      <div class="news-content">
        <img v-if="newsImagePath" :src="newsImagePath" alt="News" class="news-image" />
        <div v-else class="news-placeholder"></div>
      </div>
    </template>
  </NuxtLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'

definePageMeta({ layout: false, middleware: 'newsite', showAdbar: true, showNav: true })
useHead({ htmlAttrs: { class: 'newsite-news' } })

const newsImagePath = ref(null)

onMounted(async () => {
  try {
    const cfg = await $fetch('/api/homepage')
    newsImagePath.value = cfg.newsImagePath || null
  } catch {}
})
</script>

<style>
html.newsite-news {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat fixed !important;
}

html.newsite-news body {
  background: transparent !important;
  min-height: 100vh;
}
</style>

<style scoped>
.news-content {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 4px;
  box-sizing: border-box;
}

.news-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

.news-placeholder {
  width: 100%;
  height: 100%;
}
</style>
