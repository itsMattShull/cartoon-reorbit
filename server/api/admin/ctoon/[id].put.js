// /api/admin/ctoon/[id].put.js
import {
  defineEventHandler,
  getRequestHeader,
  createError,
  readBody,
  readMultipartFormData
} from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { computeMultiHash, bucketFromHash } from '@/server/utils/multiHash'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

// paths
const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

export default defineEventHandler(async (event) => {
  const id = event.context.params.id

  // 1) Admin check
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  // 2) Accept JSON or multipart
  const contentType = (getRequestHeader(event, 'content-type') || '').toLowerCase()
  let payload = {}
  let imagePart = null

  if (contentType.includes('multipart/form-data')) {
    const parts = await readMultipartFormData(event)
    for (const part of parts || []) {
      if (part.filename) imagePart = part
      else payload[part.name] = Buffer.isBuffer(part.data) ? part.data.toString('utf-8') : part.data
    }
  } else {
    payload = await readBody(event)
  }

  // 3) Extract fields
  const {
    name, series, rarity, price, releaseDate, perUserLimit,
    quantity, initialQuantity, inCmart, set, characters,
    isGtoon, cost, power, abilityKey, abilityData, gtoonType,
    initialReleaseAt, finalReleaseAt, initialReleaseQty, finalReleaseQty
  } = payload

  // 4) Validate basics
  if (!name?.trim())   throw createError({ statusCode: 400, statusMessage: 'Name required.' })
  if (!series?.trim()) throw createError({ statusCode: 400, statusMessage: 'Series required.' })
  if (!rarity)         throw createError({ statusCode: 400, statusMessage: 'Rarity required.' })

  const newReleaseDate = new Date(releaseDate)
  if (isNaN(newReleaseDate)) throw createError({ statusCode: 400, statusMessage: 'Invalid release date.' })

  // 5) Normalizations
  const priceInt    = price == null || price === '' ? 0 : Number(price)
  const qtyInt      = quantity == null || quantity === '' ? null : Number(quantity)
  const initQtyInt  = initialQuantity == null || initialQuantity === '' ? null : Number(initialQuantity)
  const perUserInt  = perUserLimit == null || perUserLimit === '' ? null : Number(perUserLimit)
  const inCmartBool = String(inCmart) === 'true' || inCmart === true
  const isGtoonBool = String(isGtoon) === 'true' || isGtoon === true

  // characters
  let charactersArr = characters
  if (contentType.includes('multipart/form-data')) {
    try {
      charactersArr = JSON.parse(characters)
      if (!Array.isArray(charactersArr)) throw new Error()
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'Characters must be a JSON array.' })
    }
  } else {
    if (!Array.isArray(charactersArr)) {
      throw createError({ statusCode: 400, statusMessage: 'Characters must be an array.' })
    }
  }

  // G-toon
  let costInt = null
  let powerInt = null
  let abilityDataObj = null

  if (isGtoonBool) {
    costInt  = Number(cost)
    powerInt = Number(power)
    if (isNaN(costInt) || costInt < 0 || costInt > 6)  {
      throw createError({ statusCode: 400, statusMessage: 'Cost must be 0–6.' })
    }
    if (isNaN(powerInt) || powerInt < 0 || powerInt > 12) {
      throw createError({ statusCode: 400, statusMessage: 'Power must be 0–12.' })
    }
    try {
      abilityDataObj = abilityData
        ? (typeof abilityData === 'string' ? JSON.parse(abilityData) : abilityData)
        : {}
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'Ability Data must be valid JSON.' })
    }
  }

  // 6) Build update payload
  const updateData = {
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
    characters: charactersArr,

    isGtoon:    isGtoonBool,
    gtoonType:  isGtoonBool ? (gtoonType?.toString().trim() || null) : null,
    cost:       isGtoonBool ? costInt : null,
    power:      isGtoonBool ? powerInt : null,
    abilityKey: isGtoonBool ? abilityKey : null,
    abilityData: isGtoonBool ? abilityDataObj : null,

    // advisory schedule fields
    initialReleaseAt: initialReleaseAt ? new Date(initialReleaseAt) : null,
    finalReleaseAt:   finalReleaseAt   ? new Date(finalReleaseAt)   : null,
    initialReleaseQty: initialReleaseQty == null || initialReleaseQty === '' ? null : Number(initialReleaseQty),
    finalReleaseQty:   finalReleaseQty   == null || finalReleaseQty   === '' ? null : Number(finalReleaseQty)
  }

  let imageHashData = null

  // 7) Optional image save with timestamped filename
  if (imagePart) {
    if (!['image/png','image/gif'].includes(imagePart.type)) {
      throw createError({ statusCode: 400, statusMessage: 'PNG or GIF only.' })
    }

    const { phash, dhash } = await computeMultiHash(imagePart.data)
    imageHashData = { phash, dhash, bucket: bucketFromHash(phash) }

    const safeSeries = series.trim()
    const uploadDir = process.env.NODE_ENV === 'production'
      ? join(baseDir, 'cartoon-reorbit-images', 'cToons', safeSeries)
      : join(baseDir, 'public', 'cToons', safeSeries)

    await mkdir(uploadDir, { recursive: true })

    const ext = extname(imagePart.filename || '')
    const base = basename(imagePart.filename || 'image', ext) || 'image'
    const ts = Date.now()
    const filename = `${base}-${ts}${ext}`

    const outPath = join(uploadDir, filename)
    await writeFile(outPath, imagePart.data)

    const assetPath = process.env.NODE_ENV === 'production'
      ? `/images/cToons/${safeSeries}/${filename}`
      : `/cToons/${safeSeries}/${filename}`

    updateData.assetPath = assetPath
    updateData.type = imagePart.type
  }

  // 8) Persist (fetch before and then update)
  const before = await prisma.ctoon.findUnique({ where: { id } })
  const updated = await prisma.ctoon.update({
    where: { id },
    data: updateData
  })

  if (imageHashData) {
    await prisma.ctoonImageHash.upsert({
      where: { ctoonId: id },
      create: { ctoonId: id, ...imageHashData },
      update: imageHashData
    })
  }

  // 9) Log field-level changes
  try {
    const area = `Ctoon:${id}`
    const keys = [
      'name','series','rarity','price','releaseDate','perUserLimit','quantity','initialQuantity','inCmart','set','characters',
      'isGtoon','gtoonType','cost','power','abilityKey','abilityData','assetPath','type',
      'initialReleaseAt','finalReleaseAt','initialReleaseQty','finalReleaseQty'
    ]
    for (const k of keys) {
      const prev = before ? (before[k] instanceof Date ? before[k].toISOString() : (Array.isArray(before[k]) || typeof before[k] === 'object' ? JSON.stringify(before[k]) : before[k])) : undefined
      const next = updated ? (updated[k] instanceof Date ? updated[k].toISOString() : (Array.isArray(updated[k]) || typeof updated[k] === 'object' ? JSON.stringify(updated[k]) : updated[k])) : undefined
      if (prev !== next) {
        await logAdminChange(prisma, {
          userId: me.id,
          area,
          key: k,
          prevValue: before ? before[k] : null,
          newValue: updated ? updated[k] : null
        })
      }
    }
  } catch {}

  return { success: true, ctoon: updated }
})
