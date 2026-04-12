export const useNewSiteCtoonFilter = () => useState('newSiteCtoonFilter', () => ({
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
