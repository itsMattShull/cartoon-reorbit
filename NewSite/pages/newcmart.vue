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
body.page-newcmart .sidebar-bottom { display: none; }
body.page-newcmart .sidebar { --sidebar-middle-height: 384px; }
body.page-newcmart .main-content { overflow-y: auto !important; scrollbar-width: thin; }
</style>
