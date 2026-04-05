// server/api/admin/ctoons/bulk-edit.post.js
// Applies partial field updates to multiple cToons at once.
// Only fields explicitly provided in each update item are written.
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { scheduleMintEnd, cancelMintEnd } from '@/server/utils/queues'

const ALLOWED_FIELDS = new Set([
  'rarity', 'set', 'series', 'inCmart', 'codeOnly', 'price',
  'perUserLimit', 'quantity', 'initialQuantity',
  'releaseDate', 'mintLimitType', 'mintEndDate',
])

const TIME_BASED_CAP = 999999999

export default defineEventHandler(async (event) => {
  // 1) Admin check
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  // 2) Parse body: { updates: [{ id, rarity?, set?, ... }] }
  const body = await readBody(event)
  const updates = Array.isArray(body?.updates) ? body.updates : []
  if (!updates.length) return { success: true, count: 0 }

  const results = []
  const errors = []

  for (const item of updates) {
    const id = String(item?.id || '').trim()
    if (!id) continue

    // Build partial updateData from only the allowed fields that are present
    const updateData = {}

    for (const field of ALLOWED_FIELDS) {
      if (!(field in item)) continue

      switch (field) {
        case 'rarity':
          if (item.rarity) updateData.rarity = String(item.rarity)
          break
        case 'set':
          if (item.set != null) updateData.set = String(item.set)
          break
        case 'series':
          if (item.series != null) updateData.series = String(item.series)
          break
        case 'inCmart':
          updateData.inCmart = Boolean(item.inCmart)
          break
        case 'codeOnly':
          updateData.codeOnly = Boolean(item.codeOnly)
          break
        case 'price':
          updateData.price = item.price == null || item.price === '' ? 0 : Number(item.price)
          break
        case 'perUserLimit':
          updateData.perUserLimit = item.perUserLimit == null || item.perUserLimit === '' ? null : Number(item.perUserLimit)
          break
        case 'quantity':
          updateData.quantity = item.quantity == null || item.quantity === '' ? null : Number(item.quantity)
          break
        case 'initialQuantity':
          updateData.initialQuantity = item.initialQuantity == null || item.initialQuantity === '' ? null : Number(item.initialQuantity)
          break
        case 'releaseDate': {
          const d = new Date(item.releaseDate)
          if (!isNaN(d)) updateData.releaseDate = d
          break
        }
        case 'mintLimitType': {
          const mlt = item.mintLimitType === 'timeBased' ? 'timeBased' : 'defined'
          updateData.mintLimitType = mlt
          if (mlt === 'timeBased') {
            // quantity will be set to cap if mintLimitType is timeBased and quantity not explicitly provided
            if (!('quantity' in item)) updateData.quantity = TIME_BASED_CAP
            if (!('initialQuantity' in item)) updateData.initialQuantity = TIME_BASED_CAP
          }
          break
        }
        case 'mintEndDate': {
          if (item.mintEndDate) {
            const d = new Date(item.mintEndDate)
            if (!isNaN(d)) updateData.mintEndDate = d
          } else {
            updateData.mintEndDate = null
          }
          break
        }
      }
    }

    // If mintLimitType was set to timeBased, cap quantities
    if (updateData.mintLimitType === 'timeBased') {
      if (!('quantity' in updateData)) updateData.quantity = TIME_BASED_CAP
      if (!('initialQuantity' in updateData)) updateData.initialQuantity = TIME_BASED_CAP
    }

    // If mintLimitType was set to defined, clear mintEndDate unless explicitly set
    if (updateData.mintLimitType === 'defined' && !('mintEndDate' in updateData)) {
      updateData.mintEndDate = null
    }

    if (!Object.keys(updateData).length) continue

    try {
      const before = await prisma.ctoon.findUnique({ where: { id } })
      if (!before) { errors.push({ id, error: 'Not found' }); continue }

      const updated = await prisma.ctoon.update({ where: { id }, data: updateData })

      // Log field-level changes
      try {
        const area = `Ctoon:${id}`
        for (const k of Object.keys(updateData)) {
          const prev = before[k] instanceof Date ? before[k].toISOString() : (Array.isArray(before[k]) || (before[k] !== null && typeof before[k] === 'object') ? JSON.stringify(before[k]) : before[k])
          const next = updated[k] instanceof Date ? updated[k].toISOString() : (Array.isArray(updated[k]) || (updated[k] !== null && typeof updated[k] === 'object') ? JSON.stringify(updated[k]) : updated[k])
          if (prev !== next) {
            await logAdminChange(prisma, { userId: me.id, area, key: k, prevValue: before[k], newValue: updated[k] })
          }
        }
      } catch {}

      // Manage mint-end scheduling
      try {
        const finalMintLimitType = updated.mintLimitType
        const finalMintEndDate = updated.mintEndDate
        if (finalMintLimitType === 'timeBased' && finalMintEndDate) {
          await scheduleMintEnd(id, finalMintEndDate)
        } else if (finalMintLimitType === 'defined') {
          await cancelMintEnd(id)
        }
      } catch {}

      results.push(id)
    } catch (err) {
      errors.push({ id, error: err.message || 'Update failed' })
    }
  }

  return { success: true, count: results.length, errors }
})
