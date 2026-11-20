<template>
  <component
    :is="link.is"
    v-bind="link.props"
    class="winball-promo"
  >
    <img :src="bgSrc" alt="Bottom spotlight" class="winball-promo-bg" />
    <img
      v-if="showPrize && prizeUrl"
      :src="prizeUrl"
      alt="Current Winball prize"
      class="winball-promo-prize"
    />
  </component>
</template>

<script setup>
const { data: hp } = await useAsyncData('homepage-public', () => $fetch('/api/homepage'))
const { data: prizeData } = await useAsyncData('winball-prize', () => $fetch('/api/winball-prize'))

const bgSrc = computed(() => hp.value?.bottomRightImagePath || '/images/ZoidsWinball.png')
const prizeUrl = computed(() => prizeData.value?.prize?.ctoon?.imageUrl || '')

const configuredLink = computed(() => hp.value?.bottomRightLink || null)

const isWinballLink = computed(() => {
  const link = configuredLink.value
  if (!link) return false
  return /winball/i.test(link)
})

const showPrize = computed(() => isWinballLink.value)

// Links to this site navigate in-app (no full page reload); see composables/useSiteLink.js.
const siteLink = useSiteLink()
const link = computed(() => siteLink(configuredLink.value))
</script>

<style scoped>
.winball-promo {
  display: block;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
  text-decoration: none;
}

.winball-promo-bg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (max-width: 768px) {
  .winball-promo {
    height: auto;
  }
  .winball-promo-bg {
    height: auto;
  }
}

.winball-promo-prize {
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
