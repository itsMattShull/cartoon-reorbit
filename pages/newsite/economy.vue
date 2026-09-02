<template>
  <Economy />
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'Economy',
  description: 'Live cToon economy stats — trending cToons, top values by auction and trade, and anonymous price history.'
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

// Filter state lives in useState, so it survives client-side navigation. Reset
// from the URL on every mount (same as allCtoons.vue / cmart.vue) — otherwise a
// user who hid Pokémon, wandered off to cMart and came back via a bare
// /newsite/economy link would get silently filtered numbers with nothing in the
// URL to explain them.
const route = useRoute()
const router = useRouter()
const filter = useEconomyFilter()

const q = route.query
Object.assign(filter.value, {
  ...ECONOMY_FILTER_DEFAULTS,
  // An unknown sort (stale bookmark, truncated share link) degrades to the
  // default rather than breaking the page.
  sort: isValidEconomySort(q.sort) ? q.sort : ECONOMY_FILTER_DEFAULTS.sort,
  hideGtoons: q.hideGtoons === '1',
  hidePokemon: q.hidePokemon === '1',
  hideHighMints: q.hideHighMints === '1'
})

// The exclusions change what every number on this page means, so they belong in
// the URL — a screenshot or shared link of filtered figures is misleading
// otherwise. Guard on equality so the debounced search doesn't churn history.
watch(filter, () => {
  const next = economyFilterToQuery(filter.value)
  if (JSON.stringify(route.query) !== JSON.stringify(next)) {
    router.replace({ path: route.path, query: next })
  }
}, { deep: true })
</script>

<style>
html {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat fixed !important;
}

body {
  background: transparent !important;
  min-height: 100vh;
}
</style>
