// Single source of truth for the shape of the shared newsite cToon filter.
// Consumers: CmartSidebar, AuctionHouseSidebar and MyCollectionSidebar all
// render <CtoonFilter> against this one useState key, and every one of those
// CtoonFilter instances is mounted simultaneously by layouts/newsite-template.vue
// (v-show, not v-if). Pages that want a clean slate must reset from these
// defaults on mount, or a value set on one page bleeds into the next.
//
// NOTE: pages/newsite/AuctionHouse/index.vue does not reset on mount, so any
// key added here can arrive there pre-set from another page.
export const NEW_SITE_CTOON_FILTER_DEFAULTS = {
  name:            '',
  rarities:        [],
  series:          '',
  set:             '',
  // '' = no filter, '__none__' = cToons with no cMoon assigned, else a cMoon id.
  cMoon:           '',
  priceMin:        '',
  priceMax:        '',
  sortField:       'acquiredAt',
  sortAsc:         false,
  hideUnavailable: false,
  excludeSecondEditions: false,
  duplicatesOnly:  false,
}

// Always hand back a fresh `rarities` array so callers can't share the one on
// the frozen-in-spirit defaults object.
export const newSiteCtoonFilterDefaults = () => ({
  ...NEW_SITE_CTOON_FILTER_DEFAULTS,
  rarities: [],
})

export const useNewSiteCtoonFilter = () =>
  useState('newSiteCtoonFilter', newSiteCtoonFilterDefaults)
