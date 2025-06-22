// /api/admin/ctoon/[id].put.js
import {
  defineEventHandler,
  getRequestHeader,
  createError,
  readBody
} from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const id = event.context.params.id

  /* ── 1. Admin check ─────────────────────────────────────── */
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  /* ── 2. Parse request body (JSON) ───────────────────────── */
  const body = await readBody(event)
  const {
    /* existing fields */
    name, series, rarity, price, releaseDate, perUserLimit,
    quantity, initialQuantity, inCmart, set, characters,

    /* NEW G-toon fields */
    isGtoon, cost, power, abilityKey, abilityData
  } = body

  /* ── 3. Validate core fields (quick) ────────────────────── */
  if (!name?.trim())   throw createError({ statusCode: 400, statusMessage: 'Name required.' })
  if (!series?.trim()) throw createError({ statusCode: 400, statusMessage: 'Series required.' })
  if (!rarity)         throw createError({ statusCode: 400, statusMessage: 'Rarity required.' })

  const newReleaseDate = new Date(releaseDate)
  if (isNaN(newReleaseDate)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid release date.' })
  }

  /* Parse numeric / boolean conversions */
  const priceInt      = price == null || price === '' ? 0 : Number(price)
  const qtyInt        = quantity === '' ? null : Number(quantity)
  const initQtyInt    = initialQuantity === '' ? null : Number(initialQuantity)
  const perUserInt    = perUserLimit === '' ? null : Number(perUserLimit)
  const inCmartBool   = Boolean(inCmart)
  const isGtoonBool   = Boolean(isGtoon)

  /* ── 4. G-toon validations ─────────────────────────────── */
  let costInt = null
  let powerInt = null
  let abilityDataObj = null

  if (isGtoonBool) {
    costInt  = Number(cost)
    powerInt = Number(power)

    if (isNaN(costInt) || costInt < 0 || costInt > 6) {
      throw createError({ statusCode: 400, statusMessage: 'Cost must be 0–6.' })
    }
    if (isNaN(powerInt) || powerInt < 0 || powerInt > 12) {
      throw createError({ statusCode: 400, statusMessage: 'Power must be 0–12.' })
    }

    try {
      abilityDataObj = abilityData ? JSON.parse(abilityData) : {}
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'Ability Data must be valid JSON.' })
    }
  }

  /* ── 5. Update DB ───────────────────────────────────────── */
  await prisma.ctoon.update({
    where: { id },
    data: {
      /* core fields */
      name: name.trim(),
      series: series.trim(),
      rarity,
      price: priceInt,
      releaseDate: newReleaseDate,
      perUserLimit: perUserInt,
      quantity: qtyInt,
      initialQuantity: initQtyInt,
      inCmart: inCmartBool,
      set,
      characters,

      /* G-toon columns */
      isGtoon:    isGtoonBool,
      cost:       isGtoonBool ? costInt : null,
      power:      isGtoonBool ? powerInt : null,
      abilityKey: isGtoonBool ? abilityKey : null,
      abilityData: isGtoonBool ? abilityDataObj : null
    }
  })

  return { success: true, message: 'cToon updated successfully.' }
})
