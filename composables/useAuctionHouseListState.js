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

// Set by AuctionHouse.vue right before it navigates to an auction's detail page, and consumed
// (reset to false) by pages/newsite/AuctionHouse/index.vue's own setup. Lets that page tell
// "the user is returning from our own detail view" (keep whatever filter/sort they had) apart
// from "arriving fresh from elsewhere in the site" (reset — see useNewSiteCtoonFilter.js: that
// filter state is shared with My Collection and cMart, both of which reset it to their own
// defaults on entry; the Auction House historically didn't, so a cMoon or sort field left over
// from one of those pages silently kept auctions filtered/mis-sorted here).
export const useAuctionHouseReturningFromDetail = () => useState('auctionHouseReturningFromDetail', () => false)
