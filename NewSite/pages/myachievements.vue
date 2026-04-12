<template>
  <MyAchievements />
</template>

<script setup>
definePageMeta({ showAdbar: true, showNav: true })
const sidebar = useSidebar()
sidebar.value = { middle: null, middleProps: {}, bottom: 'NavRight' }
</script>

<style>
body.page-myachievements .sidebar-middle { display: none; }
body.page-myachievements .main-content   { overflow: hidden !important; }
</style>
