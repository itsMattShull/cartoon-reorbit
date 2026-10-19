// Public: the pages need to know whether to render the closed state, and middleware runs before
// there is any login to check. Exposes the one boolean and nothing else.
import { defineEventHandler, setHeader } from 'h3'
import { getClashConfig } from '@/server/utils/clashConfig'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const { hidden } = await getClashConfig()
  return { hidden }
})
