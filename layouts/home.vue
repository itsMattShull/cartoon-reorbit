<template>
  <div>
    <slot />
  </div>
</template>

<script setup>
const route = useRoute()
const siteName = 'Cartoon ReOrbit'

useHead(() => {
  const metaTitle = route.meta.title
  const title = typeof metaTitle === 'function'
    ? metaTitle(route)
    : (typeof metaTitle === 'string' ? metaTitle : '')
  return { title: title ? `${title} | ${siteName}` : siteName }
})
</script>
