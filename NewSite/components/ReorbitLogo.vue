<template>
  <NuxtLink to="/home" class="reorbit-logo">
    <img :src="'/api/uploads/Logo/logo.gif'" alt="Reorbit Logo" />
  </NuxtLink>
</template>

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
