// server/api/admin/oggtoons/power-catalog.get.js
//
// Admin-gated read of the full historical gToons power catalog (see
// server/utils/ogGtoonPowerCatalog.js) so the "Power" combobox in
// AdminLegacyCtoonsNew.vue / AdminLegacyCtoonsEdit.vue can be populated client-side without
// bundling the (large, server-only) catalog module into the browser build.
import { defineEventHandler } from 'h3'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { OG_GTOON_POWER_CATALOG } from '@/server/utils/ogGtoonPowerCatalog'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { catalog: OG_GTOON_POWER_CATALOG }
})
