// server/api/cmart/packs.get.js
// Public-facing endpoint: list every Pack that is flagged `inCmart = true`.
// Returned shape:
//
// [
//   {
//     id:   "uuid",
//     name: "Starter Pack",
//     price: 500,
//     imagePath: "/packs/starter.png",
//     rarityConfigs: [ { rarity:"Common", count:3 }, … ]
//   },
//   ...
// ]
//
// No admin check required; optionally fail if user isn’t logged-in.

import { PrismaClient } from '@prisma/client'
import { defineEventHandler, createError, getRequestHeader } from 'h3'

let prisma
function db () {
  if (!prisma) prisma = new PrismaClient()
  return prisma
}

export default defineEventHandler(async (event) => {
  /* ── OPTIONAL auth: if your shop requires login to view ───────── */
  // Comment this block out if guests are allowed.
  const cookie = getRequestHeader(event, 'cookie') || ''
  try {
    await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Login required' })
  }

  /* ── Fetch packs that are visible in cMart ─────────────────────── */
  try {
    const packs = await db().pack.findMany({
      where: { inCmart: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        price: true,
        imagePath: true,
        rarityConfigs: {
          select: { rarity: true, count: true }
        }
      }
    })
    return packs
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/cmart/packs]', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
