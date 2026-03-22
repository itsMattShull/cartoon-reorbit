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

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const VALID_RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare', 'Prize Only', 'Code Only', 'Auction Only']

export default defineEventHandler(async (event) => {
  // Require auth (any logged-in user, not admin-only)
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const parts = await readMultipartFormData(event)
  const fields = {}
  let imagePart = null
  for (const part of parts || []) {
    if (part.filename && part.name === 'image') imagePart = part
    else if (!part.filename) {
      fields[part.name] = Buffer.isBuffer(part.data) ? part.data.toString('utf-8') : part.data
    }
  }

  if (!imagePart) throw createError({ statusCode: 400, statusMessage: 'Image required.' })
  if (!['image/png', 'image/gif'].includes(imagePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'PNG or GIF only.' })
  }

  const { name, series, set: setField, description, rarity, releaseDate: releaseRaw, characters: charsRaw, totalQuantity, initialQuantity, perUserLimit } = fields

  if (!name?.trim()) throw createError({ statusCode: 400, statusMessage: 'Name is required.' })
  if (!series?.trim()) throw createError({ statusCode: 400, statusMessage: 'Series is required.' })
  if (!setField?.trim()) throw createError({ statusCode: 400, statusMessage: 'Set is required.' })
  if (!rarity || !VALID_RARITIES.includes(rarity)) throw createError({ statusCode: 400, statusMessage: 'Valid rarity is required.' })

  const releaseDate = new Date(releaseRaw)
  if (isNaN(releaseDate)) throw createError({ statusCode: 400, statusMessage: 'Invalid release date.' })
  if (releaseDate <= new Date()) throw createError({ statusCode: 400, statusMessage: 'Release date must be in the future.' })

  let charactersArr
  try {
    charactersArr = JSON.parse(charsRaw)
    if (!Array.isArray(charactersArr) || charactersArr.length === 0) throw new Error()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Characters must be a non-empty JSON array.' })
  }

  const totQty = totalQuantity == null || totalQuantity === '' ? null : parseInt(totalQuantity, 10)
  const initQty = initialQuantity == null || initialQuantity === '' ? null : parseInt(initialQuantity, 10)
  if (initQty != null && totQty != null && initQty > totQty) {
    throw createError({ statusCode: 400, statusMessage: 'Initial quantity cannot exceed total quantity.' })
  }

  const limitInt = perUserLimit ? parseInt(perUserLimit, 10) : null

  // Save image to submitted-ctoons folder (separate from real cToons)
  const safeSeries = series.trim()
  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'submitted-ctoons', safeSeries)
    : join(baseDir, 'public', 'submitted-ctoons', safeSeries)

  await mkdir(uploadDir, { recursive: true })

  // Prefix filename with timestamp to avoid collisions
  const timestamp = Date.now()
  const safeFilename = `${timestamp}_${imagePart.filename}`
  await writeFile(join(uploadDir, safeFilename), imagePart.data)

  const assetPath = process.env.NODE_ENV === 'production'
    ? `/images/submitted-ctoons/${safeSeries}/${safeFilename}`
    : `/submitted-ctoons/${safeSeries}/${safeFilename}`

  const submitted = await prisma.submittedCtoon.create({
    data: {
      userId: me.id,
      name: name.trim(),
      series: safeSeries,
      set: setField.trim(),
      description: description?.trim() || null,
      type: imagePart.type,
      rarity,
      assetPath,
      releaseDate,
      characters: charactersArr,
      totalQuantity: totQty,
      initialQuantity: initQty,
      perUserLimit: limitInt,
      inCmart: false,
      price: 0
    }
  })

  return { submitted }
})
