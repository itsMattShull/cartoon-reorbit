<template>
  <NuxtLink to="/newsite/home" class="reorbit-logo">
    <img :src="logoPath" alt="Reorbit Logo" />
  </NuxtLink>
</template>

<script setup>
import { useSiteLogo } from '@/composables/useSiteLogo'

const { logoPath } = useSiteLogo()
</script>

<style scoped>
.reorbit-logo {
  display: block;
  width: 100%;
  height: 100%;
}

.reorbit-logo img {
  width: 100%;
  height: 100%;
  object-fit: fill;
}
</style>
