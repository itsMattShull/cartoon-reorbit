<template>
  <div class="app-layout reorbit-theme">
    <!-- Page content -->
    <slot />
    <Onboarding />
    <CtoonInfoModal />
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

<style>
.reorbit-theme {
  --reorbit-deep: #010A36;
  --reorbit-navy: #002C62;
  --reorbit-blue: #2D5294;
  --reorbit-cyan: #0FDDD6;
  --reorbit-aqua: #16ECE9;
  --reorbit-teal: #19E6AC;
  --reorbit-green: #51F68E;
  --reorbit-green-2: #70F873;
  --reorbit-lime: #AFFA2D;
  --reorbit-lime-2: #B3FB57;
  --reorbit-purple: #9647CF;

  --reorbit-border: rgba(45,82,148,0.25);
  --reorbit-tint: rgba(0,44,98,0.035);
  --reorbit-cyan-transparent: rgba(15,221,214,0.12);
  --reorbit-purple-transparent: rgba(150,71,207,0.12);
  --reorbit-green-transparent: rgba(81,246,142,0.12);
}
</style>

<style scoped>
.app-layout {
  position: relative;
  min-height: 100vh;
}
</style>
