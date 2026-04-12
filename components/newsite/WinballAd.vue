<template>
  <NuxtLink to="/games/winball" class="winball-ad">
    <img :src="bgSrc" alt="Winball promo" class="winball-ad-bg" />
    <img
      v-if="prizeUrl"
      :src="prizeUrl"
      alt="Current Winball prize"
      class="winball-ad-prize"
    />
  </NuxtLink>
</template>

<script setup>
const { data: hp } = await useAsyncData('homepage-public', () => $fetch('/api/homepage'))
const { data: prizeData } = await useAsyncData('winball-prize', () => $fetch('/api/winball-prize'))

const bgSrc = computed(() => hp.value?.bottomRightImagePath || '/images/ZoidsWinball.png')
const prizeUrl = computed(() => prizeData.value?.prize?.ctoon?.imageUrl || '')
</script>

<style scoped>
.winball-ad {
  display: block;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
}

.winball-ad-bg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.winball-ad-prize {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 60%;
  max-height: 60%;
  object-fit: contain;
  pointer-events: none;
}
</style>
