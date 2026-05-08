<template>
  <NuxtLayout name="newsite-template">
    <template #sidebar-top>
      <UserInfo />
    </template>
    <template #sidebar-middle>
      <CtoonFilter :sort-options="myCollectionSortOptions" />
    </template>
    <template #sidebar-bottom>
      <WinballPromo />
    </template>
    <template #main-content>
      <MyCollection />
    </template>
  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false, middleware: 'newsite', showAdbar: true, showNav: true })

const myCollectionSortOptions = [
  { value: 'acquiredDate', label: 'Acquired Date' },
  { value: 'name',         label: 'Name'          },
  { value: 'price',        label: 'Price'         },
  { value: 'rarity',       label: 'Rarity'        },
]

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
