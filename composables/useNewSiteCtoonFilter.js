export const useNewSiteCtoonFilter = () => useState('newSiteCtoonFilter', () => ({
  name:            '',
  rarities:        [],
  series:          '',
  set:             '',
  priceMin:        '',
  priceMax:        '',
  sortField:       'acquiredAt',
  sortAsc:         false,
  hideUnavailable: false,
}))
