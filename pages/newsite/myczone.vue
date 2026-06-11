<template>
  <MyCzone />
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'My cZone',
  description: 'Build and decorate your personal cZone on Cartoon ReOrbit with cToons from your collection.'
})

const { setSidebarMiddle } = useNewsiteLayout()
setSidebarMiddle('CzoneSidebarMiddle')
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

@media (max-width: 768px) {
  body.page-myczone.czone-build .sidebar-middle {
    flex: none !important;
  }
}
</style>
