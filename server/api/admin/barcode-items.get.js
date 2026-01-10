// server/api/admin/barcode-items.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const cfg = await db.barcodeGameConfig.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } })
  if (!cfg) return { items: [], configId: null, count: 0 }

  const items = await db.itemDefinition.findMany({ where: { configId: cfg.id }, orderBy: { code: 'asc' } })
  return { items, configId: cfg.id, count: items.length }
})

