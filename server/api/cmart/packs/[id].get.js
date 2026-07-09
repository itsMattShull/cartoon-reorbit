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

function computeDecayedPrice(basePrice, sentAt, decayAmount, decayDays, priceFloor) {
  if (!sentAt || decayAmount <= 0 || decayDays <= 0) return basePrice
  const msPerDay = 24 * 60 * 60 * 1000
  const daysSinceListed = Math.floor((Date.now() - new Date(sentAt).getTime()) / msPerDay)
  const periods = Math.floor(daysSinceListed / decayDays)
  const decayed = basePrice - periods * decayAmount
  return Math.max(decayed, priceFloor)
}

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
  const [pack, globalCfg] = await Promise.all([
    db.pack.findFirst({
      where: { id, inCmart: true },
      select: {
        id: true,
        name: true,
        price: true,
        imagePath: true,
        sentAt: true,
        rarityConfigs: {
          select: { rarity: true, count: true, probabilityPercent: true }
        },
        ctoonOptions: {
          select: {
            weight:  true,
            ctoonId: true,
            ctoon:   {
              select: {
                name: true, rarity: true, assetPath: true, isGtoon: true, cost: true, power: true,
                isSecondEdition: true,
                secondEditionOverlayX: true,
                secondEditionOverlayY: true,
                secondEditionOverlaySize: true
              }
            }
          }
        }
      }
    }),
    db.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: {
        packPriceDecayAmount: true,
        packPriceDecayDays: true,
        packPriceFloor: true
      }
    })
  ])

  if (!pack) {
    throw createError({ statusCode: 404, statusMessage: 'Pack not found' })
  }

  const decayAmount = globalCfg?.packPriceDecayAmount ?? 100
  const decayDays   = globalCfg?.packPriceDecayDays   ?? 7
  const priceFloor  = globalCfg?.packPriceFloor        ?? 700
  const effectivePrice = computeDecayedPrice(pack.price, pack.sentAt, decayAmount, decayDays, priceFloor)

  /* ── flatten ctoonOptions (merge name + rarity) ───────── */
  const flavouredCtoons = pack.ctoonOptions.map(o => ({
    ctoonId: o.ctoonId,
    name:    o.ctoon.name,
    assetPath:o.ctoon.assetPath,
    rarity:  o.ctoon.rarity,
    isGtoon: o.ctoon.isGtoon,
    cost:    o.ctoon.cost,
    power:   o.ctoon.power,
    weight:  o.weight,
    isSecondEdition:          o.ctoon.isSecondEdition,
    secondEditionOverlayX:    o.ctoon.secondEditionOverlayX,
    secondEditionOverlayY:    o.ctoon.secondEditionOverlayY,
    secondEditionOverlaySize: o.ctoon.secondEditionOverlaySize
  }))

  return {
    id: pack.id,
    name: pack.name,
    price: pack.price,
    effectivePrice,
    imagePath: pack.imagePath,
    rarityConfigs: pack.rarityConfigs,
    ctoonOptions: flavouredCtoons
  }
})
