<template>
  <NuxtLayout name="template">
    <template #main-content>
      <div class="admin-wrapper">
        <AdminTabs />
      </div>
    </template>
    <template #footer>
      <Footer />
    </template>
  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false, showAdbar: true, showNav: true, showSidebar: false, showFooter: false, mainContentBorder: false, middleware: 'auth', requiresAuth: true })
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
</style>

<style scoped>
.admin-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}
</style>
