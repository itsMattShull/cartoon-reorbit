// GET /api/cmart/active-sale
// Public endpoint. Returns the Sale to feature in the cMart showcase — either
// currently active, or starting within the next 24h (so the UI can show a
// countdown before it goes live) — with its items. Cached briefly (mirrors
// upgradesConfigCache.js) since this is fetched on every cMart page load and
// refresh cycle, and there's usually no active/upcoming sale. This is
// display-only; purchasability is always re-checked strictly server-side.

import { defineEventHandler } from 'h3'
import { getFeaturedSale } from '@/server/utils/activeSaleCache'

export default defineEventHandler(async () => {
  return await getFeaturedSale()
})
