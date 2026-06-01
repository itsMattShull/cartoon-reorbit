<template>
  <AllCtoons />
</template>

<script setup>
definePageMeta({ layout: 'newsite-template', middleware: 'newsite', showAdbar: true, showNav: true })

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
  const f = filter.value
  const query = {}
  if (f.name)                   query.name      = f.name
  if (f.rarities.length)        query.rarities  = f.rarities.join(',')
  if (f.owned !== 'all')        query.owned     = f.owned
  if (f.wishlist)               query.wishlist  = 'true'
  if (f.sortField !== 'name')   query.sortField = f.sortField
  if (!f.sortAsc)               query.sortAsc   = 'false'
  if (f.set)                    query.set       = f.set
  if (f.series)                 query.series    = f.series
  if (activeTab.value !== 'AllSets') query.tab  = activeTab.value
  router.replace({ query })
}, { deep: true })
</script>

<style>
body.page-newsite-allctoons .main-content { overflow-y: auto !important; scrollbar-width: thin; }
</style>
