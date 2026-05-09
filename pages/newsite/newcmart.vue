<template>
  <Cmart />
</template>

<script setup>
definePageMeta({ layout: 'newsite-template', middleware: 'newsite', showAdbar: true, showNav: true })

const { setSidebarMiddle } = useNewsiteLayout()
setSidebarMiddle('NewcmartSidebar')
</script>

<style>
body.page-newcmart .sidebar-bottom { display: none; }
body.page-newcmart .sidebar { --sidebar-middle-height: 384px; }
body.page-newcmart .main-content { overflow-y: auto !important; scrollbar-width: thin; }
</style>
