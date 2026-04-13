<template>
  <NuxtLayout name="newsite-template">
    <template #sidebar-top>
      <UserInfo />
    </template>
    <template #sidebar-middle>
      <CtoonFilter :show-hide-unavailable="true" :sort-options="cmartSortOptions" />
    </template>
    <template #main-content>
      <Cmart />
    </template>
    <template #footer>
      <Footer />
    </template>
  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false, middleware: 'newsite', showAdbar: true, showNav: true })

const cmartSortOptions = [
  { value: 'releaseDate', label: 'Release Date' },
  { value: 'name',        label: 'Name'         },
  { value: 'price',       label: 'Price'        },
  { value: 'rarity',      label: 'Rarity'       },
]
</script>

<style>
body.page-cmart { --shortcard-width: 154px; }
body.page-cmart .sidebar-bottom { display: none; }
body.page-cmart .sidebar { --sidebar-middle-height: 504px; }
body.page-cmart .main-content { overflow-y: auto !important; scrollbar-width: thin; }
</style>
