<template>
  <MyCollection />
</template>

<script setup>
definePageMeta({ layout: 'newsite-template', middleware: 'newsite', showAdbar: true, showNav: true })

const { setSidebarMiddle } = useNewsiteLayout()
setSidebarMiddle('MyCollectionSidebar')

const filter = useNewSiteCtoonFilter()
Object.assign(filter.value, {
  name:            '',
  rarities:        [],
  series:          '',
  set:             '',
  priceMin:        '',
  priceMax:        '',
  sortField:       'acquiredDate',
  sortAsc:         false,
  hideUnavailable: false,
})
</script>

<style>
body.page-mycollection .main-content { overflow-y: auto !important; scrollbar-width: thin; }
</style>
