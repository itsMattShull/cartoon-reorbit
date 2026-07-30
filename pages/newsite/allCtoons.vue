<template>
  <AllCtoons />
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'All cToons',
  description: 'Browse every cToon on Cartoon ReOrbit. Filter by series, set, and rarity to find your favorites.'
})

const { setSidebarMiddle } = useNewsiteLayout()
setSidebarMiddle('AllCtoonsSidebar')

const route     = useRoute()
const router    = useRouter()
const filter    = useAllCtoonsFilter()
const activeTab = useAllCtoonsTab()

const q = route.query
Object.assign(filter.value, {
  name:      q.name      || '',
  rarities:  q.rarities  ? q.rarities.split(',') : [],
  owned:     q.owned     || 'all',
  wishlist:  q.wishlist  === 'true',
  sortField: q.sortField || 'name',
  sortAsc:   q.sortAsc   !== 'false',
  set:       q.set       || '',
  series:    q.series    || '',
})
activeTab.value = q.tab === 'AllSeries' ? 'AllSeries' : 'AllSets'

watch([filter, activeTab], () => {
  router.replace({ query: filterToQuery(filter.value, activeTab.value) })
}, { deep: true })
</script>

<style>
body.page-newsite-allctoons .main-content { overflow-y: auto !important; scrollbar-width: thin; }
</style>
