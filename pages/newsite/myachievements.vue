<template>
  <MyAchievements />
</template>

<script setup>
definePageMeta({ layout: 'newsite-template', middleware: 'newsite', showAdbar: true, showNav: true })

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()
</script>

<style>
body.page-myachievements .sidebar-middle { display: none; }
body.page-myachievements .main-content   { overflow: hidden !important; }
</style>
