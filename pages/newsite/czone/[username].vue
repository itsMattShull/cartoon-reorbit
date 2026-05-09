<template>
  <MyCzone />
</template>

<script setup>
definePageMeta({ layout: 'newsite-template', middleware: 'newsite', showAdbar: true, showNav: true })

const { setSidebarMiddle } = useNewsiteLayout()
setSidebarMiddle('CzoneSidebarMiddle')
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

@media (max-width: 768px) {
  body.page-newsite-czone-username.czone-build .sidebar-middle {
    flex: none !important;
    min-height: unset !important;
    overflow: visible !important;
  }
}
</style>
