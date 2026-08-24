export const useAllCtoonsFilter = () => useState('allCtoonsFilter', () => ({
  name:      '',
  rarities:  [],
  owned:     'all',
  wishlist:  false,
  sortField: 'name',
  sortAsc:   true,
  set:       '',
  series:    '',
  // '' = no filter, '__none__' = cToons with no cMoon assigned, else a cMoon id.
  cMoon:     '',
}))
