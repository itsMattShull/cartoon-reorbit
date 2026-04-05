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
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { computeMultiHash, bucketFromHash } from '@/server/utils/multiHash'
import { scheduleMintEnd } from '@/server/utils/queues'

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
  let soundPart = null
  for (const part of parts) {
    if (part.filename && part.name === 'sound') soundPart = part
    else if (part.filename) imagePart = part
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
    isGtoon, cost, power, abilityKey, abilityData, gtoonType,

    /* Two-phase advisory fields (optional) */
    initialReleaseAt, finalReleaseAt, initialReleaseQty, finalReleaseQty,

    /* Mint limit fields */
    mintLimitType: mintLimitTypeRaw, mintEndDate: mintEndDateRaw
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

  // Mint limit type
  const TIME_BASED_CAP = 999999999
  const mintLimitType = mintLimitTypeRaw === 'timeBased' ? 'timeBased' : 'defined'
  let mintEndDate = null
  if (mintLimitType === 'timeBased') {
    mintEndDate = mintEndDateRaw ? new Date(mintEndDateRaw) : null
    if (!mintEndDate || isNaN(mintEndDate)) {
      throw createError({ statusCode: 400, statusMessage: 'Mint End Date is required for Time Based Limit.' })
    }
  }

  const priceInt = price ? parseInt(price, 10) : 0
  const limitInt = perUserLimit ? parseInt(perUserLimit, 10) : null
  const initialReleaseAtDate = initialReleaseAt ? new Date(initialReleaseAt) : null
  const finalReleaseAtDate   = finalReleaseAt   ? new Date(finalReleaseAt)   : null
  const initialReleaseQtyInt = initialReleaseQty == null || initialReleaseQty === '' ? null : parseInt(initialReleaseQty, 10)
  const finalReleaseQtyInt   = finalReleaseQty   == null || finalReleaseQty   === '' ? null : parseInt(finalReleaseQty, 10)

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

  const { phash, dhash } = await computeMultiHash(imagePart.data)
  const bucket = bucketFromHash(phash)

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

  /* 4a. Save sound (optional) -------------------------------- */
  const ALLOWED_AUDIO = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg'])
  let soundPath = null
  if (soundPart) {
    if (!ALLOWED_AUDIO.has(soundPart.type)) {
      throw createError({ statusCode: 400, statusMessage: 'Sound must be MP3, WAV, or OGG.' })
    }
    const soundUploadDir = process.env.NODE_ENV === 'production'
      ? join(baseDir, 'cartoon-reorbit-images', 'cToon-sounds', safeSeries)
      : join(baseDir, 'public', 'cToon-sounds', safeSeries)
    await mkdir(soundUploadDir, { recursive: true })
    await writeFile(join(soundUploadDir, soundPart.filename), soundPart.data)
    soundPath = process.env.NODE_ENV === 'production'
      ? `/images/cToon-sounds/${safeSeries}/${soundPart.filename}`
      : `/cToon-sounds/${safeSeries}/${soundPart.filename}`
  }

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
      quantity: mintLimitType === 'timeBased' ? TIME_BASED_CAP : totQty,
      initialQuantity: mintLimitType === 'timeBased' ? TIME_BASED_CAP : initQty,
      perUserLimit: limitInt,
      mintLimitType,
      mintEndDate,
      set: setField,
      characters: charactersArr,
      type: type.trim(),

      soundPath,

      /* NEW columns */
      isGtoon:    isGtoonBool,
      gtoonType:  isGtoonBool ? (gtoonType?.toString().trim() || null) : null,
      cost:       isGtoonBool ? costInt : null,
      power:      isGtoonBool ? powerInt : null,
      abilityKey: isGtoonBool ? abilityKey : null,
      abilityData: isGtoonBool ? abilityDataObj : null
      ,
      // advisory schedule fields
      initialReleaseAt: initialReleaseAtDate,
      finalReleaseAt:   finalReleaseAtDate,
      initialReleaseQty: initialReleaseQtyInt,
      finalReleaseQty:   finalReleaseQtyInt,
      imageHash: {
        create: {
          phash,
          dhash,
          bucket
        }
      }
    }
  })
  try {
    await logAdminChange(prisma, {
      userId: me.id,
      area: `Ctoon:${newCtoon.id}`,
      key: 'create',
      prevValue: null,
      newValue: { id: newCtoon.id, name: newCtoon.name, series: newCtoon.series, rarity: newCtoon.rarity }
    })
  } catch {}

  // Schedule the mint-end job for time-based cToons
  if (mintLimitType === 'timeBased' && mintEndDate) {
    try {
      await scheduleMintEnd(newCtoon.id, mintEndDate)
    } catch (err) {
      console.error(`[ctoon.post] Failed to schedule mint-end for ${newCtoon.id}:`, err)
    }
  }

  return { ctoon: newCtoon }
})
