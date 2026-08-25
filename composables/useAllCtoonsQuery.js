// Serializes an All cToons filter + tab into a router query object,
// matching the shape pages/newsite/allCtoons.vue reads back on mount.
export function filterToQuery(filter, tab) {
  const query = {}
  if (filter.name)                    query.name      = filter.name
  if (filter.rarities.length)         query.rarities  = filter.rarities.join(',')
  if (filter.owned !== 'all')         query.owned     = filter.owned
  if (filter.wishlist)                query.wishlist  = 'true'
  if (filter.sortField !== 'name')    query.sortField = filter.sortField
  if (!filter.sortAsc)                query.sortAsc   = 'false'
  if (filter.set)                     query.set       = filter.set
  if (filter.series)                  query.series    = filter.series
  if (filter.cMoon)                   query.cMoon     = filter.cMoon
  if (tab !== 'AllSets')              query.tab       = tab
  return query
}
