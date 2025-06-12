// server/api/cmart/packs/[id].get.js
// Public endpoint that returns the full detail of ONE pack
// (thumbnail, price, rarity breakdown, and every cToon option
// enriched with its name + rarity).
//
// Path param :id   — UUID of the pack
//
// Shape:
//
// {
//   id:   "uuid",
//   name: "Starter Pack",
//   price: 500,
//   imagePath: "/packs/starter.png",
//   rarityConfigs: [ { rarity:"Common", count:3 }, … ],
//   ctoonOptions:  [
//     { ctoonId:"...", name:"Funky Cat", rarity:"Common",  weight:40 },
//     { ctoonId:"...", name:"Epic Dog",  rarity:"Rare",    weight:10 },
//     …
//   ]
// }

import { defineEventHandler, createError, getRequestHeader } from 'h3'
import { prisma as db } from '@/server/prisma'


export default defineEventHandler(async (event) => {
  /* ── (Optional) require login ─────────────────────────── */
  // Comment-out if guests can view packs
  const cookie = getRequestHeader(event, 'cookie') || ''
  try {
    await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Login required' })
  }

  /* ── :id from route params ────────────────────────────── */
  const id = event.context.params.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id param' })

  /* ── query pack (+children) ───────────────────────────── */
  const pack = await db.pack.findFirst({
    where: { id, inCmart: true },
    select: {
      id: true,
      name: true,
      price: true,
      imagePath: true,
      rarityConfigs: {
        select: { rarity: true, count: true }
      },
      ctoonOptions: {
        select: {
          weight:  true,
          ctoonId: true,
          ctoon:   { select: { name: true, rarity: true, assetPath: true } }
        }
      }
    }
  })

  if (!pack) {
    throw createError({ statusCode: 404, statusMessage: 'Pack not found' })
  }

  /* ── flatten ctoonOptions (merge name + rarity) ───────── */
  const flavouredCtoons = pack.ctoonOptions.map(o => ({
    ctoonId: o.ctoonId,
    name:    o.ctoon.name,
    assetPath:o.ctoon.assetPath,
    rarity:  o.ctoon.rarity,
    weight:  o.weight
  }))

  return {
    id: pack.id,
    name: pack.name,
    price: pack.price,
    imagePath: pack.imagePath,
    rarityConfigs: pack.rarityConfigs,
    ctoonOptions: flavouredCtoons
  }
})
