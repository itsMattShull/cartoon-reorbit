<template>
  <div class="orbit-label">
    <img :src="labelSrc" alt="" />
  </div>
</template>

<script setup>
const { data } = await useFetch('/api/homepage')
const labelSrc = computed(() => data.value?.labelImagePath || '/images/newsite/orbit-label.gif')
</script>

<style scoped>
.orbit-label {
  width: 100%;
  height: 100%;
}

.orbit-label img {
  width: 100%;
  height: 100%;
  object-fit: fill;
}
</style>
