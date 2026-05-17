<template>
  <AllCtoons />
</template>

<script setup>
definePageMeta({ layout: 'newsite-template', middleware: 'newsite', showAdbar: true, showNav: true })

const { setSidebarMiddle } = useNewsiteLayout()
setSidebarMiddle('AllCtoonsSidebar')

const filter = useAllCtoonsFilter()
Object.assign(filter.value, {
  name:      '',
  rarities:  [],
  owned:     'all',
  sortField: 'name',
  sortAsc:   true,
})

const activeTab = useAllCtoonsTab()
activeTab.value = 'AllSets'
</script>

<style>
body.page-newsite-allctoons .main-content { overflow-y: auto !important; scrollbar-width: thin; }
</style>
