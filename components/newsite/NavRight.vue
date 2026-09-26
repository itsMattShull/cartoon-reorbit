<template>
  <div class="nav-right">
    <NuxtLink to="/newsite/MycWorld" class="nav-link" data-nav-sound="my-cworld">
      <BlueButton :style="{ height: buttonHeight }">My cWorld</BlueButton>
    </NuxtLink>
    <NuxtLink to="/newsite/cmart" class="nav-link" data-nav-sound="cmart">
      <BlueButton :style="{ height: buttonHeight }">cMart</BlueButton>
    </NuxtLink>
    <NuxtLink to="/newsite/AuctionHouse" class="nav-link" data-nav-sound="auctions">
      <BlueButton :style="{ height: buttonHeight }">Auctions</BlueButton>
    </NuxtLink>
    <NuxtLink to="/newsite/trade" class="nav-link" data-nav-sound="trades">
      <BlueButton :style="{ height: buttonHeight }">Trades</BlueButton>
    </NuxtLink>
    <NuxtLink to="/newsite/Games" class="nav-link" data-nav-sound="games">
      <BlueButton :style="{ height: buttonHeight }">Games</BlueButton>
    </NuxtLink>
    <NavEncyclopediaDropdown :button-height="buttonHeight" />
    <NuxtLink v-if="!isMobile" to="/newsite/redeem" class="nav-link" data-nav-sound="redeem">
      <BlueButton :style="{ height: buttonHeight }">Redeem</BlueButton>
    </NuxtLink>
    <NuxtLink v-if="!isMobile" to="/newsite/settings" class="nav-link" data-nav-sound="settings">
      <BlueButton :style="{ height: buttonHeight }">Settings</BlueButton>
    </NuxtLink>
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

  /* On mobile this row always renders exactly 6 buttons (My cWorld/cMart/Auctions/Trades/Games/
     the Encyclopedia dropdown trigger — Redeem/Settings move to NavLeft.vue instead), one more
     than BlueButton's own shared mobile size leaves room for: at BlueButton's default mobile
     size the 6th button had nowhere to go but its own wrapped row, landing centered and alone
     beneath the other five. Sized here (not in BlueButton.vue itself) so the shrink is scoped to
     this specific row instead of every blue button on the site. :deep() reaches into BlueButton's
     own scoped style, and into NavEncyclopediaDropdown's trigger button, since both render as
     genuine DOM descendants of .nav-right despite being separate components. */
  .nav-right :deep(.blue-button) {
    font-size: 0.64rem;
    padding: 3px 5px;
  }
}
</style>
