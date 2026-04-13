<template>
  <NuxtLayout name="newsite-template">
    <template v-if="!cz.buildMode" #sidebar-top>
      <UserInfo />
    </template>
    <template #sidebar-middle>
      <CzoneEdit v-if="cz.buildMode" @save="czoneRef?.save()" @clear="czoneRef?.clearZone()" />
    </template>
    <template v-if="!cz.buildMode" #sidebar-bottom>
      <WinballAd />
    </template>
    <template #main-content>
      <MyCzone ref="czoneRef" />
    </template>
    <template #footer>
      <Footer />
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
/* ── Base page styles ── */
body.page-newsite-czone-username .main-content { overflow: auto !important; scrollbar-width: thin; }

@media (max-width: 768px) {
  body.page-newsite-czone-username .main-content {
    aspect-ratio: 800 / 669;
    min-height: 300px;
  }
}

/* ── Build mode: CzoneEdit fills entire sidebar with 4px border ── */
body.page-newsite-czone-username.czone-build .sidebar-top    { display: none !important; }
body.page-newsite-czone-username.czone-build .sidebar-bottom { display: none !important; }
body.page-newsite-czone-username.czone-build .sidebar-middle {
  flex: 1 !important;
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  margin: 4px !important;
  width: calc(100% - 8px) !important;
  box-sizing: border-box;
}
</style>
