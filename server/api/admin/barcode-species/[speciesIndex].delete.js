// server/api/admin/barcode-species/[speciesIndex].delete.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const cfg = await db.barcodeGameConfig.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } })
  if (!cfg) throw createError({ statusCode: 500, statusMessage: 'Active config not found' })

  const speciesIndex = Number(event.context.params?.speciesIndex)
  if (!Number.isInteger(speciesIndex) || speciesIndex < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid speciesIndex' })
  }

  const before = await db.speciesBaseStats.findUnique({ where: { configId_speciesIndex: { configId: cfg.id, speciesIndex } } })
  if (!before) throw createError({ statusCode: 404, statusMessage: 'Species not found' })

  await db.speciesBaseStats.delete({ where: { configId_speciesIndex: { configId: cfg.id, speciesIndex } } })
  await logAdminChange(db, { userId: me.id, area: 'SpeciesBaseStats', key: `delete:${speciesIndex}`, prevValue: before, newValue: null })
  return { ok: true }
})

