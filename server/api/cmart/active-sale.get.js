// GET /api/cmart/active-sale
// Public endpoint. Returns the currently active Sale (if any) with its items,
// for the cMart showcase section. Cached briefly (mirrors upgradesConfigCache.js)
// since this is fetched on every cMart page load and refresh cycle, and there's
// usually no active sale.

import { defineEventHandler } from 'h3'
import { getActiveSale } from '@/server/utils/activeSaleCache'

export default defineEventHandler(async () => {
  return await getActiveSale()
})
