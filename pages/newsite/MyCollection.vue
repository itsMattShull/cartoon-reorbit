<template>
  <NuxtLayout name="newsite-template">
    <template #sidebar-top>
      <UserInfo />
    </template>
    <template #sidebar-middle>
      <CtoonFilter />
    </template>
    <template #main-content>
      <MyCollection />
    </template>
    <template #footer>
      <Footer />
    </template>
  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false, middleware: 'newsite', showAdbar: true, showNav: true })
</script>

<style>
body.page-mycollection .sidebar-bottom { display: none; }
body.page-mycollection .sidebar { --sidebar-middle-height: 504px; }
body.page-mycollection .main-content { overflow-y: auto !important; scrollbar-width: thin; }
</style>
