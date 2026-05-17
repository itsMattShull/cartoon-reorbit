export const useAllCtoonsFilter = () => useState('allCtoonsFilter', () => ({
  name:      '',
  rarities:  [],
  owned:     'all',
  sortField: 'name',
  sortAsc:   true,
}))
