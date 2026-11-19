<template>
  <div class="middle-sidebar-images">
    <template v-for="n in 3" :key="n">
      <component
        v-if="imageSrc(n)"
        :is="siteLink(configuredLink(n)).is"
        v-bind="siteLink(configuredLink(n)).props"
        class="middle-sidebar-item"
      >
        <img :src="imageSrc(n)" :alt="'Middle sidebar image ' + n" class="middle-sidebar-img" />
        <img
          v-if="isWinballLink(n) && prizeUrl"
          :src="prizeUrl"
          alt="Current Winball prize"
          class="middle-sidebar-prize"
        />
      </component>
    </template>
  </div>
</template>

<script setup>
const { data: hp } = await useAsyncData('homepage-public', () => $fetch('/api/homepage'))
const { data: prizeData } = await useAsyncData('winball-prize', () => $fetch('/api/winball-prize'))

const prizeUrl = computed(() => prizeData.value?.prize?.ctoon?.imageUrl || '')

function imageSrc(n) {
  return hp.value?.[`middleSidebar${n}ImagePath`] || null
}

function configuredLink(n) {
  return hp.value?.[`middleSidebar${n}Link`] || null
}

function isWinballLink(n) {
  const link = configuredLink(n)
  if (!link) return false
  return /winball/i.test(link)
}

// Links to this site navigate in-app (no full page reload); see composables/useSiteLink.js.
const siteLink = useSiteLink()
</script>

<style scoped>
.middle-sidebar-images {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 0;
}

.middle-sidebar-item {
  display: block;
  position: relative;
  width: 100%;
  text-decoration: none;
  overflow: hidden;
}

.middle-sidebar-img {
  width: 100%;
  height: auto;
  display: block;
}

.middle-sidebar-prize {
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
