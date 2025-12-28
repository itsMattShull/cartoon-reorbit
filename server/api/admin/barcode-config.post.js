// server/api/admin/barcode-config.post.js
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

function clamp01(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.min(1, Math.max(0, x))
}

function approxEqual(a, b, eps = 1e-6) {
  return Math.abs(Number(a) - Number(b)) <= eps
}

function normalizeRarityPayload(input) {
  const src = input || {}
  const pick = (k) => {
    const v = src?.[k]
    return Number.isFinite(Number(v)) ? Number(v) : 0
  }
  const out = {
    Common: pick('Common'),
    Uncommon: pick('Uncommon'),
    Rare: pick('Rare'),
    VeryRare: pick('VeryRare'),
    CrazyRare: pick('CrazyRare'),
  }
  // Also include UPPER_SNAKE keys for compatibility with scan code
  return {
    ...out,
    COMMON: out.Common,
    UNCOMMON: out.Uncommon,
    RARE: out.Rare,
    VERY_RARE: out.VeryRare,
    CRAZY_RARE: out.CrazyRare,
  }
}

function normalizeItemRarityPayload(input) {
  const src = input || {}
  const pick = (k) => {
    const v = src?.[k]
    return Number.isFinite(Number(v)) ? Number(v) : 0
  }
  const out = {
    Common: pick('Common'),
    Rare: pick('Rare'),
    CrazyRare: pick('CrazyRare'),
  }
  return {
    ...out,
    COMMON: out.Common,
    RARE: out.Rare,
    CRAZY_RARE: out.CrazyRare,
  }
}

export default defineEventHandler(async (event) => {
  // Admin auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const body = await readBody(event)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
  }

  const {
    oddsNothing,
    oddsItem,
    oddsMonster,
    monsterRarityChances, // expected as percentages (0..100), any sum
    itemRarityChances,    // expected as percentages (0..100), any sum
    monsterStatVariancePct, // expected percent (0..50)
    barcodeCooldownDays,
  } = body

  // Validate odds: must be finite numbers in [0,1] and sum to 1
  const on = clamp01(oddsNothing)
  const oi = clamp01(oddsItem)
  const om = clamp01(oddsMonster)
  const sum = on + oi + om
  if (!approxEqual(sum, 1)) {
    throw createError({ statusCode: 400, statusMessage: 'Odds must sum to 1.00' })
  }

  // Validate variance percent
  const varPct = Number(monsterStatVariancePct)
  if (!Number.isFinite(varPct) || varPct < 0 || varPct > 50) {
    throw createError({ statusCode: 400, statusMessage: 'Variance must be 0–50%' })
  }

  // Validate cooldown
  const cooldownDays = Number(barcodeCooldownDays)
  if (!Number.isInteger(cooldownDays) || cooldownDays < 0 || cooldownDays > 365) {
    throw createError({ statusCode: 400, statusMessage: 'Cooldown must be an integer 0–365' })
  }

  const rarity = normalizeRarityPayload(monsterRarityChances)
  const itemRarity = normalizeItemRarityPayload(itemRarityChances)

  // Upsert active config (create if missing)
  const before = await db.barcodeGameConfig.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } })

  const payload = {
    oddsNothing: on,
    oddsItem: oi,
    oddsMonster: om,
    monsterRarityChances: rarity,
    itemRarityChances: itemRarity,
    monsterStatVariancePct: varPct / 100, // store as 0..0.5
    barcodeCooldownDays: cooldownDays,
  }

  let cfg
  async function createOrUpdate(withItems) {
    if (!before) {
      return await db.barcodeGameConfig.create({
        data: {
          version: '1.0',
          isActive: true,
          ...(withItems ? payload : { ...payload, itemRarityChances: undefined })
        }
      })
    } else {
      const data = withItems ? payload : { ...payload }
      if (!withItems) delete data.itemRarityChances
      return await db.barcodeGameConfig.update({ where: { id: before.id }, data })
    }
  }

  try {
    cfg = await createOrUpdate(true)
  } catch (e) {
    // Fallback for older schema missing itemRarityChances
    cfg = await createOrUpdate(false)
  }

  // Log changes field-by-field
  try {
    const fields = ['oddsNothing','oddsItem','oddsMonster','monsterRarityChances','itemRarityChances','monsterStatVariancePct','barcodeCooldownDays']
    for (const k of fields) {
      const prevVal = before ? before[k] : undefined
      const nextVal = cfg ? cfg[k] : undefined
      // Simple deep compare via JSON for objects
      const changed = (typeof prevVal === 'object' || typeof nextVal === 'object')
        ? JSON.stringify(prevVal) !== JSON.stringify(nextVal)
        : prevVal !== nextVal
      if (changed) {
        await logAdminChange(db, { userId: me.id, area: 'BarcodeGameConfig', key: k, prevValue: prevVal, newValue: nextVal })
      }
    }
  } catch {}

  return cfg
})
