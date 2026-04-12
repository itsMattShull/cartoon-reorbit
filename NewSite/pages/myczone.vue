<template>
  <MyCzone />
</template>

<script setup>
definePageMeta({ showAdbar: true, showNav: true })

const cz = useCzoneState()
const sidebar = useSidebar()

// Reactively set sidebar-middle based on build mode
watch(() => cz.value.buildMode, (buildMode) => {
  sidebar.value.middle = buildMode ? 'CzoneEdit' : null
}, { immediate: true })

sidebar.value.bottom = 'SidebarBottom'

// Reset build mode on leave so sidebar restores on next visit
onUnmounted(() => { cz.value.buildMode = false })
</script>

<style>
/* ── Base page styles ── */
body.page-myczone .main-content { overflow: auto !important; scrollbar-width: thin; }

/* ── Build mode: CzoneEdit fills entire sidebar with 4px border ── */
body.page-myczone.czone-build .sidebar-top    { display: none !important; }
body.page-myczone.czone-build .sidebar-bottom { display: none !important; }
body.page-myczone.czone-build .sidebar-middle {
  flex: 1 !important;
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  margin: 4px !important;
  width: calc(100% - 8px) !important;
  box-sizing: border-box;
}
</style>
