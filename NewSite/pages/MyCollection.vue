<template>
  <MyCollection />
</template>

<script setup>
definePageMeta({ showAdbar: true, showNav: true })
const sidebar = useSidebar()
sidebar.value = { middle: 'CtoonFilter', middleProps: {}, bottom: null }
</script>

<style>
body.page-mycollection .sidebar-bottom { display: none; }
body.page-mycollection .sidebar { --sidebar-middle-height: 384px; }
body.page-mycollection .main-content { overflow-y: auto !important; scrollbar-width: thin; }
</style>
