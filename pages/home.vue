<template>
  <div class="home-images-grid">
    <template v-for="n in 4" :key="n">
      <component
        :is="siteLink(imageLink(n)).is"
        v-bind="siteLink(imageLink(n)).props"
        class="home-image-cell"
      >
        <img v-if="imagePath(n)" :src="imagePath(n)" :alt="'Home image ' + n" class="home-image" />
        <div v-else class="home-image-placeholder"></div>
      </component>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'Home',
  description: "Welcome to Cartoon ReOrbit, a fan-made revival of Cartoon Network's Cartoon Orbit. Collect cToons, build your cZone, trade with friends, and play games."
})
useHead({ htmlAttrs: { class: 'newsite-home' } })

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

const cfg = ref(null)

onMounted(async () => {
  try {
    cfg.value = await $fetch('/api/homepage')
  } catch {}
})

function imagePath(n) {
  return cfg.value?.[`homeImage${n}Path`] || null
}

function imageLink(n) {
  return cfg.value?.[`homeImage${n}Link`] || null
}

// Links to this site navigate in-app (no full page reload); see composables/useSiteLink.js.
const siteLink = useSiteLink()
</script>

<style>
html.newsite-home {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat fixed !important;
}

html.newsite-home body {
  background: transparent !important;
  min-height: 100vh;
}
</style>

<style scoped>
.home-images-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .home-images-grid {
    grid-template-columns: 1fr;
    grid-template-rows: repeat(4, auto);
    height: auto;
  }

  .home-image {
    height: auto;
  }
}

.home-image-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  text-decoration: none;
}

.home-image {
  max-width: 100%;
  max-height: 100%;
  width: 100%;
  height: 100%;
  object-fit: fill;
  display: block;
}

.home-image-placeholder {
  width: 100%;
  height: 100%;
}
</style>
