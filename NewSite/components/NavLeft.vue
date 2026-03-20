<template>
  <div class="nav-left">
    <NuxtLink to="/home">
      <BlueButton :style="{ height: buttonHeight }">Reorbit Home</BlueButton>
    </NuxtLink>
    <NuxtLink v-if="isAdmin" to="/administration">
      <BlueButton :style="{ height: buttonHeight }">Admin</BlueButton>
    </NuxtLink>
    <BlueButton v-if="isMobile" :style="{ height: buttonHeight }">Settings</BlueButton>
    <GreenButton :style="{ height: buttonHeight }" @click="logout">Logout</GreenButton>
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

const { isAdmin, logout } = useAuth()
</script>

<style scoped>
.nav-left {
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
