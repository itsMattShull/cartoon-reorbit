// server/api/admin/rarity-defaults.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

const DEFAULTS = {
  'Common':       { totalQuantity: 160, initialQuantity: 160, perUserLimit: 7, inCmart: true,  price: 100 },
  'Uncommon':     { totalQuantity: 120, initialQuantity: 120, perUserLimit: 5, inCmart: true,  price: 200 },
  'Rare':         { totalQuantity: 80,  initialQuantity: 80,  perUserLimit: 3, inCmart: true,  price: 400 },
  'Very Rare':    { totalQuantity: 60,  initialQuantity: 60,  perUserLimit: 2, inCmart: true,  price: 750 },
  'Crazy Rare':   { totalQuantity: 40,  initialQuantity: 40,  perUserLimit: 1, inCmart: true,  price: 1250 },
  'Auction Only': { totalQuantity: null, initialQuantity: null, perUserLimit: null, inCmart: false, price: 0 },
  'Prize Only':   { totalQuantity: null, initialQuantity: null, perUserLimit: null, inCmart: false, price: 0 },
  'Code Only':    { totalQuantity: null, initialQuantity: null, perUserLimit: null, inCmart: false, price: 0 }
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const row = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  const merged = { ...DEFAULTS, ...(row?.rarityDefaults || {}) }
  return { defaults: merged }
})

