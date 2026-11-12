<template>
  <div class="economy-ticker">
    <!-- Static chips, not rotated — there's only ever one number each. Glyph
         plus colour so direction reads without relying on colour alone. -->
    <EconomyIndexChip
      label="Economy Index"
      help-label="What is the Economy Index?"
      :data="inflation"
      :loaded="inflationLoaded"
      @help="showIndexModal = true"
    />

    <!-- Second, independent figure: the same index with high-mint cToons left out —
         see EconomyIndexModal's exHighMints variant for why that's a separate number
         rather than replacing the one above. -->
    <EconomyIndexChip
      label="Economy Index (ex. high mints)"
      help-label="What does excluding high mints mean?"
      :data="exHighMints"
      :loaded="inflationLoaded"
      @help="showExHighMintsModal = true"
    />

    <!-- Live top-10 active-auction strip — see EconomyAuctionTicker.vue. -->
    <EconomyAuctionTicker />

    <EconomyIndexModal
      v-if="showIndexModal"
      :inflation="inflation"
      variant="all"
      @close="showIndexModal = false"
    />
    <EconomyIndexModal
      v-if="showExHighMintsModal"
      :inflation="inflation"
      variant="exHighMints"
      :high-mint-threshold="inflation?.highMintExclusionThreshold"
      @close="showExHighMintsModal = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const INFLATION_POLL_MS = 30000

const inflation = ref(null)
const inflationLoaded = ref(false)
const pageHidden = ref(false)
const showIndexModal = ref(false)
const showExHighMintsModal = ref(false)

const exHighMints = computed(() => inflation.value?.exHighMints ?? null)

async function fetchInflation() {
  try {
    inflation.value = await $fetch('/api/economy/inflation')
  } catch {
    // Leave the last good value on screen rather than blanking it.
  } finally {
    inflationLoaded.value = true
  }
}

let inflationHandle = null

function onVisibilityChange() {
  pageHidden.value = document.hidden
  if (!pageHidden.value) fetchInflation()
}

onMounted(() => {
  pageHidden.value = document.hidden
  document.addEventListener('visibilitychange', onVisibilityChange)

  fetchInflation()

  inflationHandle = setInterval(() => {
    if (pageHidden.value) return
    fetchInflation()
  }, INFLATION_POLL_MS)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (inflationHandle) clearInterval(inflationHandle)
})
</script>

<style scoped>
/* Single flex/block root so this drops in cleanly whether the caller shows it
   inline above the stat tiles or inside a collapsible container. */
.economy-ticker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}
</style>
