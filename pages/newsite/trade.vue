<template>
  <NuxtLayout name="newsite-template">
    <template #sidebar-top>
      <UserInfo />
    </template>
    <template #sidebar-middle>
      <TradeSidebar v-if="showTradeFilters" />
    </template>
    <template #sidebar-bottom>
      <WinballPromo />
    </template>
    <template #main-content>
      <Trade />
    </template>
  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false, middleware: ['auth', 'newsite'], showAdbar: true, showNav: true })

const { tradeActiveTab, tradeTargetUser, tradeCurrentStep } = useTradePageFilters()

const showTradeFilters = computed(() =>
  tradeActiveTab.value === 'create' &&
  tradeTargetUser.value !== null &&
  tradeCurrentStep.value >= 1 &&
  tradeCurrentStep.value <= 2
)
</script>

<style>
html {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat fixed !important;
}

body {
  background: transparent !important;
  min-height: 100vh;
}

body.page-newsite-trade .sidebar {
  --sidebar-middle-height: 490px;
}
</style>
