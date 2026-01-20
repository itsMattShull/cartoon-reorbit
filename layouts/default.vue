<template>
  <div class="app-layout reorbit-theme">
    <slot />
    <Onboarding v-if="showOnboarding" />
    <CtoonInfoModal />
  </div>
</template>

<script setup>
const route = useRoute()
const siteName = 'Cartoon ReOrbit'

const showOnboarding = computed(() => !route.path.startsWith('/games/clash'))

useHead(() => {
  const metaTitle = route.meta.title
  const title =
    typeof metaTitle === 'function'
      ? metaTitle(route)
      : typeof metaTitle === 'string'
        ? metaTitle
        : ''
  return { title: title ? `${title} | ${siteName}` : siteName }
})
</script>
