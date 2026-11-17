// Tells the player client whether to show the MyOrbit launcher at all. Cheap: getGlobalConfig()
// is already cached (see server/utils/cmoon.js), so this is safe to call on every page load.
import { defineEventHandler, createError } from 'h3'
import { getGlobalConfig } from '@/server/utils/cmoon'

export default defineEventHandler(async (event) => {
  if (!event.context.userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  const config = await getGlobalConfig()
  return { enabled: !!config?.myOrbitEnabled }
})
