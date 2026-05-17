export const useAllCtoonsFilter = () => useState('allCtoonsFilter', () => ({
  name:      '',
  rarities:  [],
  owned:     'all',
  wishlist:  false,
  sortField: 'name',
  sortAsc:   true,
}))
