<template>
  <AllCtoons />
</template>

<script setup>
definePageMeta({ layout: 'newsite-template', middleware: 'newsite', showAdbar: true, showNav: true })

const { setSidebarMiddle } = useNewsiteLayout()
setSidebarMiddle('AllCtoonsSidebar')

const filter = useNewSiteCtoonFilter()
Object.assign(filter.value, {
  name:            '',
  rarities:        [],
  series:          '',
  set:             '',
  priceMin:        '',
  priceMax:        '',
  sortField:       'name',
  sortAsc:         true,
  hideUnavailable: false,
})
</script>

<style>
body.page-allctoons .main-content { overflow-y: auto !important; scrollbar-width: thin; }
</style>
