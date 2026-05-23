<template>
  <div class="nav-left">
    <NuxtLink to="/newsite/home">
      <BlueButton :style="{ height: buttonHeight }">ReOrbit Home</BlueButton>
    </NuxtLink>
    <NuxtLink v-if="isAdmin" to="/newsite/admin">
      <BlueButton :style="{ height: buttonHeight }">Admin</BlueButton>
    </NuxtLink>
    <NuxtLink v-if="isMobile" to="/newsite/settings" class="nav-link">
      <BlueButton :style="{ height: buttonHeight }">Settings</BlueButton>
    </NuxtLink>
    <NuxtLink v-if="isMobile" to="/newsite/redeem" class="nav-link">
      <BlueButton :style="{ height: buttonHeight }">Redeem</BlueButton>
    </NuxtLink>
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
.nav-link {
  text-decoration: none;
  display: contents;
}

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

@media (max-width: 768px) {
  .nav-left {
    flex-wrap: wrap;
    height: auto;
    padding: 4px 6px;
  }
}
</style>
