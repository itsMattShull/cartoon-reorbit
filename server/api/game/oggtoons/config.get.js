// Public config for the original gToons (2002 game) feature — just the four visibility
// switches an admin can flip from Manage Games. Public and unauthenticated on purpose: the hub
// page needs to know which tabs to hide before it knows whether the visitor is even logged in.
import { defineEventHandler, setHeader } from 'h3'
import { getOgGtoonsConfig } from '@/server/utils/ogGtoonsConfig'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300')
  return await getOgGtoonsConfig()
})
