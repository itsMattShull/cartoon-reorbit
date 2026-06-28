export const useMyWishlistFilter = () => useState('myWishlistFilter', () => ({
  name:      '',
  rarities:  [],
  sortField: 'name',
  sortAsc:   true,
}))
