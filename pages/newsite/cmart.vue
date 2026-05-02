<template>
  <NuxtLayout name="newsite-template">
    <template #sidebar-top>
      <UserInfo />
    </template>
    <template #sidebar-middle>
      <div class="cmart-sidebar-middle">
        <div class="cmart-tab-bar">
          <button
            class="cmart-tab"
            :class="{ active: cmartTab === 'ctoons' }"
            @click="cmartTab = 'ctoons'"
          >cToons</button>
          <button
            class="cmart-tab"
            :class="{ active: cmartTab === 'packs' }"
            @click="cmartTab = 'packs'"
          >Packs</button>
        </div>
        <CtoonFilter
          v-if="cmartTab === 'ctoons'"
          :show-hide-unavailable="true"
          :sort-options="cmartSortOptions"
        />
      </div>
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

const cmartTab = useState('newSiteCmartTab', () => 'ctoons')
const filter   = useNewSiteCtoonFilter()
const route    = useRoute()
const router   = useRouter()

const cmartSortOptions = [
  { value: 'releaseDate', label: 'Release Date' },
  { value: 'name',        label: 'Name'         },
  { value: 'price',       label: 'Price'        },
  { value: 'rarity',      label: 'Rarity'       },
]

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

<style scoped>
.cmart-sidebar-middle {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.cmart-tab-bar {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  width: 100%;
}

.cmart-tab {
  flex: 1;
  padding: 5px 4px;
  font-size: 0.75rem;
  font-weight: bold;
  font-family: inherit;
  color: rgba(255, 255, 255, 0.55);
  background: rgba(0, 0, 0, 0.2);
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.cmart-tab:hover {
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.15);
}

.cmart-tab.active {
  color: #ffffff;
  background: rgba(0, 0, 0, 0.1);
  border-bottom-color: var(--OrbitLightBlue, #3399CC);
}
</style>
