// server/api/cmart/packs.get.js
// Public-facing endpoint: list every Pack that is flagged `inCmart = true`.
// Returns effectivePrice (decay applied, before half-price) alongside the base price.

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
  const cookie = getRequestHeader(event, 'cookie') || ''
  try {
    await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Login required' })
  }

  try {
    const [packs, globalCfg] = await Promise.all([
      db.pack.findMany({
        where: { inCmart: true },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          price: true,
          imagePath: true,
          sentAt: true,
          rarityConfigs: {
            select: { rarity: true, count: true, probabilityPercent: true }
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

    const decayAmount = globalCfg?.packPriceDecayAmount ?? 100
    const decayDays   = globalCfg?.packPriceDecayDays   ?? 7
    const priceFloor  = globalCfg?.packPriceFloor        ?? 700

    return packs.map(pack => ({
      ...pack,
      effectivePrice: computeDecayedPrice(pack.price, pack.sentAt, decayAmount, decayDays, priceFloor)
    }))
  } catch (err) {
    console.error('[GET /api/cmart/packs]', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
