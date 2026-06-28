export const useMyWishlistFilter = () => useState('myWishlistFilter', () => ({
  name:      '',
  rarities:  [],
  tradable:  false,
  sortField: 'name',
  sortAsc:   true,
}))
