<template>
  <div class="nav-right">
    <BlueButton :style="{ height: buttonHeight }">My cWorld</BlueButton>
    <BlueButton :style="{ height: buttonHeight }">Get cToons</BlueButton>
    <BlueButton :style="{ height: buttonHeight }">Games</BlueButton>
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
