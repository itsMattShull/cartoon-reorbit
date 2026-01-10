// server/api/admin/rarity-defaults.post.js
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const body = await readBody(event)
  const { defaults } = body || {}
  if (!defaults || typeof defaults !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid defaults payload' })
  }

  // very light validation; ensure each rarity maps to object with required keys
  const keys = ['totalQuantity', 'initialQuantity', 'perUserLimit', 'inCmart', 'price']
  for (const [rarity, cfg] of Object.entries(defaults)) {
    if (typeof cfg !== 'object' || cfg == null) {
      throw createError({ statusCode: 400, statusMessage: `Invalid config for ${rarity}` })
    }
    for (const k of keys) {
      if (!(k in cfg)) {
        throw createError({ statusCode: 400, statusMessage: `Missing key ${k} for ${rarity}` })
      }
    }
  }

  const before = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  const row = await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', dailyPointLimit: 250, rarityDefaults: defaults },
    update: { rarityDefaults: defaults }
  })
  try {
    const prev = before?.rarityDefaults ?? null
    const next = defaults ?? null
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      await logAdminChange(db, {
        userId: me.id,
        area: 'GlobalGameConfig',
        key: 'rarityDefaults',
        prevValue: prev,
        newValue: next
      })
    }
  } catch {}
  return { success: true }
})
