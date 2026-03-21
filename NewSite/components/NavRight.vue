<template>
  <div class="nav-right">
    <NuxtLink to="/MycWorld" class="nav-link">
      <BlueButton :style="{ height: buttonHeight }">My cWorld</BlueButton>
    </NuxtLink>
    <NuxtLink to="/GetcToons" class="nav-link">
      <BlueButton :style="{ height: buttonHeight }">Get cToons</BlueButton>
    </NuxtLink>
    <NuxtLink to="/Games" class="nav-link">
      <BlueButton :style="{ height: buttonHeight }">Games</BlueButton>
    </NuxtLink>
    <BlueButton :style="{ height: buttonHeight }">Placeholder 4</BlueButton>
    <BlueButton v-if="!isMobile" :style="{ height: buttonHeight }">Settings</BlueButton>
  </div>
</template>

<script setup>
const props = defineProps({
  buttonHeight: {
    type: String,
    default: '22px'
  },
  isMobile: {
    type: Boolean,
    default: false
  }
})
</script>

<style scoped>
.nav-link {
  text-decoration: none;
  display: contents;
}

.nav-right {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  padding: 0 6px;
  box-sizing: border-box;
}
</style>
