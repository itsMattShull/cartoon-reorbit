// Session-scoped (resets on a hard reload, survives SPA navigation) memory of
// which Auction House tab/page the user was on, so returning from an auction's
// detail page doesn't dump them back on "Current" page 1.
export const useAuctionHouseListState = () => useState('auctionHouseListState', () => ({
  activeTab:   'current',
  currentPage: 1,
  myPage:      1,
  myBidsPage:  1,
  allPage:     1,
}))

// Kept separate from useAuctionHouseListState so nothing that ever watches the
// tab/page object deeply also fires on scroll-position writes. Stores the id
// of the topmost visible item per tab rather than a raw pixel offset, since a
// pixel offset breaks across the list/card layout's own responsive column and
// row-height changes.
export const useAuctionHouseScrollAnchor = () => useState('auctionHouseScrollAnchor', () => ({
  current: null,
  mybids:  null,
  mine:    null,
  all:     null,
}))
