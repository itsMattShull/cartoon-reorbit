<template>
  <div class="middle-sidebar-images">
    <template v-for="n in 3" :key="n">
      <component
        v-if="imageSrc(n)"
        :is="linkTag(n)"
        v-bind="linkProps(n)"
        class="middle-sidebar-item"
      >
        <img :src="imageSrc(n)" :alt="'Middle sidebar image ' + n" class="middle-sidebar-img" />
      </component>
    </template>
  </div>
</template>

<script setup>
const { data: hp } = await useAsyncData('homepage-public', () => $fetch('/api/homepage'))

function imageSrc(n) {
  return hp.value?.[`middleSidebar${n}ImagePath`] || null
}

function configuredLink(n) {
  return hp.value?.[`middleSidebar${n}Link`] || null
}

function linkTag(n) {
  return configuredLink(n) ? 'a' : 'div'
}

function linkProps(n) {
  const link = configuredLink(n)
  if (!link) return {}
  let target = '_self'
  try {
    const url = new URL(link, window.location.href)
    target = url.origin === window.location.origin ? '_self' : '_blank'
  } catch {}
  return { href: link, target }
}
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
  width: 100%;
  text-decoration: none;
  overflow: hidden;
}

.middle-sidebar-img {
  width: 100%;
  height: auto;
  display: block;
}
</style>
