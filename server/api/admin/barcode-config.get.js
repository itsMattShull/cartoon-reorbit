// server/api/admin/barcode-config.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // Admin auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  let cfg = await db.barcodeGameConfig.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' }
  })

  if (!cfg) {
    try {
      cfg = await db.barcodeGameConfig.create({
        data: {
          version: '1.0',
          isActive: true,
          // keep defaults from schema for odds & variance
          // store empty object for rarity chances to trigger scan fallback thresholds
          monsterRarityChances: {},
          itemRarityChances: {},
        }
      })
    } catch {
      // Fallback for older schema without itemRarityChances
      cfg = await db.barcodeGameConfig.create({
        data: {
          version: '1.0',
          isActive: true,
          monsterRarityChances: {},
        }
      })
    }
  }

  return cfg
})
