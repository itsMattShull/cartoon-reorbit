// utils/tutorialSections.js
// Shared section keys/labels for the tutorial page — imported by both the
// public page/admin editor (client) and the server sanitizer/API routes, so
// this stays out of server/ (which is Nitro-only territory) on purpose.
export const SECTION_META = [
  { key: 'intro', label: 'Welcome' },
  { key: 'auctions', label: 'Auction House' },
  { key: 'trades', label: 'Trading' },
  { key: 'cmoons', label: 'cMoons' },
  { key: 'cmart', label: 'cMart' },
  { key: 'games', label: 'Games' },
  { key: 'cworld', label: 'My cWorld' },
  { key: 'points', label: 'Earning Points' },
  { key: 'tips', label: 'Helpful Tips' }
]

export const SECTION_KEYS = SECTION_META.map((s) => s.key)
