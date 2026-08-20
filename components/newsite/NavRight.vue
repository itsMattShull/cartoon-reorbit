<template>
  <div class="nav-right">
    <NuxtLink to="/newsite/MycWorld" class="nav-link">
      <BlueButton :style="{ height: buttonHeight }">My cWorld</BlueButton>
    </NuxtLink>
    <NuxtLink to="/newsite/cmart" class="nav-link">
      <BlueButton :style="{ height: buttonHeight }">cMart</BlueButton>
    </NuxtLink>
    <NuxtLink to="/newsite/AuctionHouse" class="nav-link">
      <BlueButton :style="{ height: buttonHeight }">Auctions</BlueButton>
    </NuxtLink>
    <NuxtLink to="/newsite/trade" class="nav-link">
      <BlueButton :style="{ height: buttonHeight }">Trades</BlueButton>
    </NuxtLink>
    <NuxtLink to="/newsite/economy" class="nav-link">
      <BlueButton :style="{ height: buttonHeight }">Economy</BlueButton>
    </NuxtLink>
    <NuxtLink to="/newsite/Games" class="nav-link">
      <BlueButton :style="{ height: buttonHeight }">Games</BlueButton>
    </NuxtLink>
    <NuxtLink v-if="!isMobile" to="/newsite/redeem" class="nav-link">
      <BlueButton :style="{ height: buttonHeight }">Redeem</BlueButton>
    </NuxtLink>
    <NuxtLink v-if="!isMobile" to="/newsite/settings" class="nav-link">
      <BlueButton :style="{ height: buttonHeight }">Settings</BlueButton>
    </NuxtLink>
    <!-- "Chat", not "Toggle Chat" — nav-right clips overflow, and the longer
         label would eat into Settings on an admin's wider nav-left. Hidden
         where the sidebar itself is hidden (games + admin console). -->
    <BlueButton
      v-if="chatAvailable"
      :style="{ height: buttonHeight }"
      :aria-pressed="chatOpen ? 'true' : 'false'"
      @click="toggleChat"
    >Chat</BlueButton>
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

const route = useRoute()
const { chatOpen, toggleChat } = useNewsiteLayout()
const chatAvailable = computed(() => route.meta.showSidebar !== false && route.meta.fluidLayout !== true)
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
  justify-content: space-evenly;
  width: 100%;
  height: 100%;
  padding: 0 6px;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .nav-right {
    flex-wrap: wrap;
    height: auto;
    padding: 4px 6px;
  }
}
</style>
