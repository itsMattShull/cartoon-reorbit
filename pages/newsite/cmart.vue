<template>
  <Cmart />
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'cMart',
  description: 'Shop the cMart on Cartoon ReOrbit and spend your points on the newest cToon releases and packs.'
})

const { setSidebarMiddle } = useNewsiteLayout()
setSidebarMiddle('CmartSidebar')

const cmartTab = useState('newSiteCmartTab', () => 'ctoons')
const filter   = useNewSiteCtoonFilter()
const aFilters = useAuctionHouseFilters()
const route    = useRoute()
const router   = useRouter()

// ── Initialize filter state (reset then apply URL params) ──────────────────
Object.assign(filter.value, {
  name:            '',
  rarities:        [],
  series:          '',
  set:             '',
  priceMin:        '',
  priceMax:        '',
  sortField:       'releaseDate',
  sortAsc:         false,
  hideUnavailable: false,
})
Object.assign(aFilters.value, {
  featuredOnly:  false,
  hasBidsOnly:   false,
  gtoonsOnly:    false,
  wishlistOnly:  false,
  selectedOwned: 'all',
})

const q = route.query
if (typeof q.q      === 'string' && q.q)      filter.value.name      = q.q
if (q.rarity) {
  filter.value.rarities = Array.isArray(q.rarity)
    ? q.rarity.filter(Boolean)
    : String(q.rarity).split(',').map(s => s.trim()).filter(Boolean)
}
if (typeof q.series   === 'string' && q.series)   filter.value.series   = q.series
if (typeof q.set      === 'string' && q.set)      filter.value.set      = q.set
if (typeof q.priceMin === 'string' && q.priceMin) filter.value.priceMin = q.priceMin
if (typeof q.priceMax === 'string' && q.priceMax) filter.value.priceMax = q.priceMax
if (typeof q.sort     === 'string' && q.sort)     filter.value.sortField = q.sort
if (q.sortDir === 'asc') filter.value.sortAsc = true
if (q.available === 'true') filter.value.hideUnavailable = true
if (q.tab === 'packs') cmartTab.value = 'packs'

// ── Sync filter + tab → URL ────────────────────────────────────────────────
function updateUrl() {
  const f        = filter.value
  const newQuery = {}

  if (f.name)              newQuery.q        = f.name
  if (f.rarities.length)   newQuery.rarity   = f.rarities.join(',')
  if (f.series)            newQuery.series   = f.series
  if (f.set)               newQuery.set      = f.set
  if (f.priceMin !== '')   newQuery.priceMin = String(f.priceMin)
  if (f.priceMax !== '')   newQuery.priceMax = String(f.priceMax)
  if (f.sortField && f.sortField !== 'releaseDate') newQuery.sort = f.sortField
  if (f.sortAsc)           newQuery.sortDir  = 'asc'
  if (f.hideUnavailable)   newQuery.available = 'true'
  if (cmartTab.value !== 'ctoons') newQuery.tab = cmartTab.value

  const current = JSON.stringify(route.query)
  const next    = JSON.stringify(newQuery)
  if (current !== next) router.replace({ path: route.path, query: newQuery })
}

watch([filter, cmartTab], updateUrl, { deep: true })
</script>

<style>
body.page-cmart { --shortcard-width: 154px; }
body.page-cmart .sidebar-bottom { display: none; }
body.page-cmart .sidebar { --sidebar-middle-height: 504px; }
body.page-cmart .main-content { overflow-y: auto !important; scrollbar-width: thin; }
</style>

