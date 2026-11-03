// POST /api/packs/open   { userPackId }
//
// The ONLY way to open a sealed pack (cMart after a purchase, My Collection > Packs, the Redeem page). Replaces
// GET /api/cmart/open-pack, which changed state on a GET: with SameSite=lax cookies a plain link posted anywhere
// (a Discord message, say) is a top-level navigation that carries the session cookie, so clicking it burned the
// victim's pack and skipped the reveal. A JSON body cannot be sent cross-site without a CORS preflight, so requiring
// application/json closes that off.
//
// Responds with the cards that were pulled (see server/utils/openUserPack.js), each carrying a server-computed `isNew`.
// Errors: 400 already opened / bad body, 401, 404 not your pack, 409 in an active auction / pending trade, or nothing
// left to pull (the pack stays sealed), 415 not JSON.
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { mintQueue } from '@/server/utils/queues'
import { openUserPack } from '@/server/utils/openUserPack'
import { isUuid } from '@/server/utils/tradeOfferRules'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  if (!String(getRequestHeader(event, 'content-type') || '').toLowerCase().startsWith('application/json')) {
    throw createError({ statusCode: 415, statusMessage: 'Content-Type must be application/json' })
  }
  const body = (await readBody(event)) || {}
  const userPackId = typeof body.userPackId === 'string' ? body.userPackId.toLowerCase() : null
  if (!isUuid(userPackId)) throw createError({ statusCode: 400, statusMessage: 'userPackId is required' })

  return openUserPack({ db: prisma, mintQueue, userId: me.id, userPackId })
})
