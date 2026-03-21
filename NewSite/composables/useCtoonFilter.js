export const useCtoonFilter = () => useState('ctoonFilter', () => ({
  name:            '',
  rarities:        [],
  series:          '',
  set:             '',
  priceMin:        '',
  priceMax:        '',
  sortField:       'name',
  sortAsc:         true,
  hideUnavailable: false,
}))
