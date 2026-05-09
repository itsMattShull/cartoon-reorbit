<template>
  <TradeSidebar v-if="showTradeFilters" />
</template>

<script setup>
const { tradeActiveTab, tradeTargetUser, tradeCurrentStep } = useTradePageFilters()

const showTradeFilters = computed(() =>
  tradeActiveTab.value === 'create' &&
  tradeTargetUser.value !== null &&
  tradeCurrentStep.value >= 1 &&
  tradeCurrentStep.value <= 2
)
</script>
