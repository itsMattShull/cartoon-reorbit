import {
  defineEventHandler,
  readMultipartFormData,
  getRequestHeader,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '@/server/prisma'

// ── path helpers ──────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

export default defineEventHandler(async (event) => {
  /* 1. Auth / admin check ------------------------------------ */
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  /* 2. Parse multipart form ---------------------------------- */
  const parts  = await readMultipartFormData(event)
  const fields = {}
  let imagePart = null
  for (const part of parts) {
    if (part.filename) imagePart = part
    else fields[part.name] = Buffer.isBuffer(part.data) ? part.data.toString('utf-8') : part.data
  }

  /* 3. Basic validations (unchanged) ------------------------- */
  if (!imagePart) throw createError({ statusCode: 400, statusMessage: 'Image required.' })
  if (!['image/png', 'image/gif'].includes(imagePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'PNG or GIF only.' })
  }

  const {
    /* existing fields */
    name, series, rarity, releaseDate: releaseRaw,
    totalQuantity, initialQuantity, perUserLimit,
    codeOnly, inCmart, price, set: setField, characters: charsRaw, type,

    /* NEW G-toon fields */
    isGtoon, cost, power, abilityKey, abilityData, gtoonType
  } = fields

  if (!name?.trim())   throw createError({ statusCode: 400, statusMessage: 'Name is required.' })
  if (!series?.trim()) throw createError({ statusCode: 400, statusMessage: 'Series is required.' })
  if (!rarity)         throw createError({ statusCode: 400, statusMessage: 'Rarity is required.' })
  if (!setField)       throw createError({ statusCode: 400, statusMessage: 'Set is required.' })

  const releaseDate = new Date(releaseRaw)
  if (isNaN(releaseDate)) throw createError({ statusCode: 400, statusMessage: 'Invalid release date.' })
  if (releaseDate <= new Date()) throw createError({ statusCode: 400, statusMessage: 'Release must be future.' })

  const codeOnlyBool = String(codeOnly) === 'true'
  const inCmartBool  = String(inCmart)  === 'true'
  if (codeOnlyBool && inCmartBool) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot be Code-Only and in C-mart.' })
  }

  const totQty  = totalQuantity  == null || totalQuantity  === '' ? null : parseInt(totalQuantity,10)
  const initQty = initialQuantity == null || initialQuantity === '' ? null : parseInt(initialQuantity,10)
  if (initQty != null && totQty != null && initQty > totQty) {
    throw createError({ statusCode: 400, statusMessage: 'Initial qty > total qty.' })
  }

  /* characters array ----------------------------------------- */
  let charactersArr
  try {
    charactersArr = JSON.parse(charsRaw)
    if (!Array.isArray(charactersArr) || charactersArr.length === 0) throw new Error()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Characters must be a non-empty JSON array.' })
  }

  const priceInt = price ? parseInt(price, 10) : 0
  const limitInt = perUserLimit ? parseInt(perUserLimit, 10) : null

  /* 3a. G-toon-specific validation --------------------------- */
  const isGtoonBool = String(isGtoon) === 'true'
  let costInt = 0
  let powerInt = 0
  let abilityDataObj = {}

  if (isGtoonBool) {
    costInt  = parseInt(cost, 10)
    powerInt = parseInt(power, 10)

    if (isNaN(costInt) || costInt < 0 || costInt > 6) {
      throw createError({ statusCode: 400, statusMessage: 'Cost must be between 0 and 6.' })
    }
    if (isNaN(powerInt) || powerInt < 0 || powerInt > 12) {
      throw createError({ statusCode: 400, statusMessage: 'Power must be between 0 and 12.' })
    }
  }

  /* 4. Save image ------------------------------------------- */
  const safeSeries = series.trim()
  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'cToons', safeSeries)
    : join(baseDir, 'public', 'cToons', safeSeries)

  await mkdir(uploadDir, { recursive: true })
  const outPath = join(uploadDir, imagePart.filename)
  await writeFile(outPath, imagePart.data)

  const assetPath = process.env.NODE_ENV === 'production'
    ? `/images/cToons/${safeSeries}/${imagePart.filename}`
    : `/cToons/${safeSeries}/${imagePart.filename}`

  /* 5. Persist to DB ---------------------------------------- */
  const newCtoon = await prisma.ctoon.create({
    data: {
      name: name.trim(),
      series: safeSeries,
      rarity,
      assetPath,
      releaseDate,
      price: priceInt,
      inCmart: inCmartBool,
      codeOnly: codeOnlyBool,
      quantity: totQty,
      initialQuantity: initQty,
      perUserLimit: limitInt,
      set: setField,
      characters: charactersArr,
      type: type.trim(),

      /* NEW columns */
      isGtoon:    isGtoonBool,
      gtoonType:  isGtoonBool ? (gtoonType?.toString().trim() || null) : null,
      cost:       isGtoonBool ? costInt : null,
      power:      isGtoonBool ? powerInt : null,
      abilityKey: isGtoonBool ? abilityKey : null,
      abilityData: isGtoonBool ? abilityDataObj : null
    }
  })

  return { ctoon: newCtoon }
})
