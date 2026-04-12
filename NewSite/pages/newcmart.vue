<template>
  <Cmart />
</template>

<script setup>
definePageMeta({ showAdbar: true, showNav: true })
const sidebar = useSidebar()
sidebar.value = { middle: 'CtoonFilter', middleProps: { showHideUnavailable: true }, bottom: null }
</script>

<style>
body.page-newcmart .sidebar-bottom { display: none; }
body.page-newcmart .sidebar { --sidebar-middle-height: 384px; }
body.page-newcmart .main-content { overflow-y: auto !important; scrollbar-width: thin; }
</style>
