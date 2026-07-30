// Sort/exclusion state for the Economy page, shared between
// components/newsite/Economy.vue (which renders and applies it) and
// pages/newsite/economy.vue (which syncs it to the URL), matching how
// useAllCtoonsFilter / useNewSiteCtoonFilter are used by their pages.
//
// Sort tokens carry their own direction (nameAsc / releaseDesc / ...) instead of
// the sortField+sortAsc pair the list pages use: "Most Traded" and "Most
// Auctioned" have no meaningful ascending counterpart, so a field+direction pair
// would produce two unreachable states. Same convention as
// AuctionHouse.vue's sort tokens. Keep these in sync with BROWSE_SORTS in
// server/utils/economyFilters.js.
export const ECONOMY_SORTS = [
  { value: 'nameAsc', label: 'Name (A→Z)' },
  { value: 'nameDesc', label: 'Name (Z→A)' },
  { value: 'releaseDesc', label: 'Release Date (Newest)' },
  { value: 'releaseAsc', label: 'Release Date (Oldest)' },
  { value: 'tradeVolume', label: 'Most Traded (all time)' },
  { value: 'auctionVolume', label: 'Most Auctioned (all time)' }
]

export const ECONOMY_FILTER_DEFAULTS = {
  sort: 'nameAsc',
  hideGtoons: false,
  hidePokemon: false
}

export const useEconomyFilter = () => useState('economyFilter', () => ({ ...ECONOMY_FILTER_DEFAULTS }))

export const isValidEconomySort = (sort) => ECONOMY_SORTS.some(s => s.value === sort)

export function economyFilterToQuery(filter) {
  const query = {}
  if (filter.sort && filter.sort !== ECONOMY_FILTER_DEFAULTS.sort) query.sort = filter.sort
  if (filter.hideGtoons) query.hideGtoons = '1'
  if (filter.hidePokemon) query.hidePokemon = '1'
  return query
}
