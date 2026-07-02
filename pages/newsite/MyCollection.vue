<template>
  <MyCollection />
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'My Collection',
  description: 'View and manage your cToon collection on Cartoon ReOrbit.'
})

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
  excludeSecondEditions: false,
})
</script>

<style>
body.page-mycollection .main-content { overflow-y: auto !important; scrollbar-width: thin; }
</style>
