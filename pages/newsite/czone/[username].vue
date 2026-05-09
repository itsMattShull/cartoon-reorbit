<template>
  <NuxtLayout name="newsite-template">
    <template v-if="!cz.buildMode" #sidebar-top>
      <UserInfo />
    </template>
    <template #sidebar-middle>
      <CzoneEdit v-if="cz.buildMode" @save="czoneRef?.save()" @clear="czoneRef?.clearZone()" />
    </template>
    <template v-if="!cz.buildMode" #sidebar-bottom>
      <WinballPromo />
    </template>
    <template #main-content>
      <MyCzone ref="czoneRef" />
    </template>
  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false, middleware: 'newsite', showAdbar: true, showNav: true })

const cz      = useNewSiteCzoneState()
const czoneRef = ref(null)

// Reset build mode on leave so sidebar restores on next visit
onUnmounted(() => { cz.value.buildMode = false })
</script>

<style>
/* ── Build mode: CzoneEdit fills entire sidebar ── */
body.page-newsite-czone-username.czone-build .sidebar-top    { display: none !important; }
body.page-newsite-czone-username.czone-build .sidebar-bottom { display: none !important; }
body.page-newsite-czone-username.czone-build .sidebar-middle {
  /* Grow to fill the full sidebar height once top/bottom are hidden */
  flex: 1 1 0 !important;
  /* Turn into a flex column so CzoneEdit (.czew) can use flex:1 reliably.
     height:auto is NOT used here — it breaks height:100% on children because
     the browser won't treat a flex-grown height as "definite" for % resolution. */
  display: flex !important;
  flex-direction: column !important;
  min-height: 0 !important;
  max-height: none !important;
  margin: 4px !important;
  width: calc(100% - 8px) !important;
  box-sizing: border-box;
  overflow: hidden !important;
  padding: 0 !important;
}
</style>
