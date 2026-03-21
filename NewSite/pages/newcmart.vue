<template>
  <NuxtLayout name="template">
    <template #sidebar-top>
      <UserInfo />
    </template>
    <template #sidebar-middle>
      <CtoonFilter :show-hide-unavailable="true" />
    </template>
    <template #main-content>
      <Cmart />
    </template>
    <template #footer>
      <Footer />
    </template>
  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false, showAdbar: true, showNav: true })
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

.sidebar-bottom {
  display: none;
}

.main-content {
  overflow-y: auto !important;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitDarkBlue, #336699) transparent;
}

.sidebar {
  --sidebar-middle-height: 384px;
}
</style>
