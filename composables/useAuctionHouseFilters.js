export const useAuctionHouseFilters = () => useState('auctionHouseFilters', () => ({
  featuredOnly:  false,
  hasBidsOnly:   false,
  gtoonsOnly:    false,
  wishlistOnly:  false,
  selectedOwned: 'all',
  // 'all' | 'ctoon' | 'pack' — an inline control in the top bar, NOT in the sidebar (which is collapsed on phones).
  itemType:      'all',
}))
