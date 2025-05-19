import { PrismaClient } from '@prisma/client'
import {
  defineEventHandler,
  readMultipartFormData,
  getRequestHeader,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// __dirname workaround for ESM
const __dirname = dirname(fileURLToPath(import.meta.url))

// Determine base directory for uploads:
// Use project root in production; in development, use CWD
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '.')
  : process.cwd()
console.log('base directory: ', baseDir)
const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  // ── 1. Admin check ──────────────────────────────────────────────────────
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

  // ── 2. Parse multipart/form-data ────────────────────────────────────────
  const parts = await readMultipartFormData(event)
  const fields = {}
  let imagePart = null

  for (const part of parts) {
    if (part.filename) {
      imagePart = part
    } else {
      const raw = part.data
      fields[part.name] = Buffer.isBuffer(raw) ? raw.toString('utf-8') : raw
    }
  }

  // ── 3. Validate inputs ──────────────────────────────────────────────────
  if (!imagePart) {
    throw createError({ statusCode: 400, statusMessage: 'An image file is required.' })
  }
  if (!['image/png', 'image/gif'].includes(imagePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG or GIF images are allowed.' })
  }

  const {
    name,
    series,
    rarity,
    releaseDate: releaseRaw,
    totalQuantity,
    initialQuantity,
    perUserLimit,
    codeOnly,
    inCmart,
    price,
    set: setField,
    characters: charsRaw,
    type
  } = fields

  if (!name?.trim()) throw createError({ statusCode: 400, statusMessage: 'Name is required.' })
  if (!series?.trim()) throw createError({ statusCode: 400, statusMessage: 'Series is required.' })
  if (!rarity) throw createError({ statusCode: 400, statusMessage: 'Rarity is required.' })
  if (!setField) throw createError({ statusCode: 400, statusMessage: 'Set is required.' })

  const releaseDate = new Date(releaseRaw)
  if (isNaN(releaseDate.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid release date/time.' })
  }
  if (releaseDate <= new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'Release date/time must be in the future.' })
  }

  const codeOnlyBool = String(codeOnly) === 'true'
  const inCmartBool = String(inCmart) === 'true'
  if (codeOnlyBool && inCmartBool) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot be Code Only and In C-mart at the same time.' })
  }

  const totQty = totalQuantity != null && totalQuantity !== '' ? parseInt(totalQuantity, 10) : null
  const initQty = initialQuantity != null && initialQuantity !== '' ? parseInt(initialQuantity, 10) : null
  if (initQty != null && totQty != null && initQty > totQty) {
    throw createError({ statusCode: 400, statusMessage: 'Initial Quantity must be less than Total Quantity.' })
  }

  let charactersArr
  try {
    charactersArr = JSON.parse(charsRaw)
    if (!Array.isArray(charactersArr) || charactersArr.length === 0) {
      throw new Error()
    }
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Characters must be a non-empty array.' })
  }

  const priceInt = price != null && price !== '' ? parseInt(price, 10) : 0
  const limitInt = perUserLimit != null && perUserLimit !== '' ? parseInt(perUserLimit, 10) : null

  // ── 4. Save image to disk ────────────────────────────────────────────────
  const safeSeries = series.trim()
  const uploadDir = join(baseDir, 'public', 'cToons', safeSeries)
  await mkdir(uploadDir, { recursive: true })
  const filename = imagePart.filename
  const outPath = join(uploadDir, filename)
  await writeFile(outPath, imagePart.data)

  const assetPath = `/cToons/${safeSeries}/${filename}`

  // ── 5. Create in database ───────────────────────────────────────────────
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
      type: type.trim()
    }
  })

  return { ctoon: newCtoon }
})
