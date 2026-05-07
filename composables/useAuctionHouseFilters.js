export const useAuctionHouseFilters = () => useState('auctionHouseFilters', () => ({
  featuredOnly:  false,
  hasBidsOnly:   false,
  gtoonsOnly:    false,
  wishlistOnly:  false,
  selectedOwned: 'all',
}))
