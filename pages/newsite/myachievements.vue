<template>
  <NuxtLayout name="newsite-template">
    <template #sidebar-top>
      <UserInfo />
    </template>
    <template #sidebar-bottom>
      <NavRight />
    </template>
    <template #main-content>
      <MyAchievements />
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
body.page-myachievements .sidebar-middle { display: none; }
body.page-myachievements .main-content   { overflow: hidden !important; }
</style>
