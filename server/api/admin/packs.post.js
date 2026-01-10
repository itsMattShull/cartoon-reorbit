// server/api/admin/packs.post.js
// Creates a Pack, saves its thumbnail to /public/packs/ and records rarity + cToon options.
// Accepts multipart/form‑data with:
//   • field "meta"   – JSON string of the pack metadata (name, price, etc.)
//   • field "image"  – PNG or JPEG file

import {
  defineEventHandler,
  readMultipartFormData,
  getRequestHeader,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { prisma as db } from '@/server/prisma'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

function validatePayload (meta) {
  if (!meta?.name || typeof meta.name !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "name"' })
  }
  if (!Array.isArray(meta.rarityConfigs) || meta.rarityConfigs.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'rarityConfigs array required' })
  }
  if (!Array.isArray(meta.ctoonOptions) || meta.ctoonOptions.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'ctoonOptions array required' })
  }
  const dupRarity = meta.rarityConfigs.map(r => r.rarity).find((r, i, a) => a.indexOf(r) !== i)
  if (dupRarity) throw createError({ statusCode: 400, statusMessage: `Duplicate rarity \"${dupRarity}\"` })
  const dupCtoon = meta.ctoonOptions.map(o => o.ctoonId).find((r, i, a) => a.indexOf(r) !== i)
  if (dupCtoon) throw createError({ statusCode: 400, statusMessage: `Duplicate cToon \"${dupCtoon}\"` })
  const allowedBehaviors = new Set(['REMOVE_ON_ANY_RARITY_EMPTY', 'KEEP_IF_SINGLE_RARITY_EMPTY'])
  if (meta.sellOutBehavior && !allowedBehaviors.has(meta.sellOutBehavior)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid sellOutBehavior value' })
  }
}

function parseLocalYmdHm(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(s)
  if (!m) return null
  return { y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5] }
}

function centralLocalToUTC(localYmdHm) {
  const parts = parseLocalYmdHm(localYmdHm)
  if (!parts) return null

  const { y, m, d, h, mi } = parts
  const utcGuessMs = Date.UTC(y, m - 1, d, h, mi, 0)

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
  const displayed = Object.fromEntries(
    fmt.formatToParts(new Date(utcGuessMs))
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value])
  )
  const zonalMs = Date.UTC(
    Number(displayed.year),
    Number(displayed.month) - 1,
    Number(displayed.day),
    Number(displayed.hour),
    Number(displayed.minute),
    Number(displayed.second)
  )

  const offsetMs = zonalMs - utcGuessMs
  return new Date(utcGuessMs - offsetMs)
}

export default defineEventHandler(async (event) => {
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

  const parts = await readMultipartFormData(event)
  const fields = {}
  let imagePart = null

  for (const part of parts) {
    if (part.filename) {
      imagePart = part
    } else {
      fields[part.name] = Buffer.isBuffer(part.data) ? part.data.toString('utf-8') : part.data
    }
  }

  if (!imagePart) {
    throw createError({ statusCode: 400, statusMessage: 'Image file is required.' })
  }
  if (!['image/png', 'image/jpeg'].includes(imagePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG or JPEG allowed.' })
  }

  const meta = fields.meta ? JSON.parse(fields.meta) : null
  validatePayload(meta)

  const scheduledAtLocal = String(meta?.scheduledAtLocal || '').trim()
  let scheduledAt = null
  if (scheduledAtLocal) {
    const parts = parseLocalYmdHm(scheduledAtLocal)
    if (!parts) {
      throw createError({ statusCode: 400, statusMessage: 'scheduledAtLocal must be "YYYY-MM-DD HH:mm"' })
    }
    if (parts.mi !== 0) {
      throw createError({ statusCode: 400, statusMessage: 'scheduledAtLocal must be on the hour (minutes = 00)' })
    }
    scheduledAt = centralLocalToUTC(scheduledAtLocal)
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      throw createError({ statusCode: 400, statusMessage: 'scheduledAtLocal must be "YYYY-MM-DD HH:mm"' })
    }
  }

  const scheduledOffAtLocal = String(meta?.scheduledOffAtLocal || '').trim()
  let scheduledOffAt = null
  if (scheduledOffAtLocal) {
    const parts = parseLocalYmdHm(scheduledOffAtLocal)
    if (!parts) {
      throw createError({ statusCode: 400, statusMessage: 'scheduledOffAtLocal must be "YYYY-MM-DD HH:mm"' })
    }
    if (parts.mi !== 0) {
      throw createError({ statusCode: 400, statusMessage: 'scheduledOffAtLocal must be on the hour (minutes = 00)' })
    }
    scheduledOffAt = centralLocalToUTC(scheduledOffAtLocal)
    if (!scheduledOffAt || Number.isNaN(scheduledOffAt.getTime())) {
      throw createError({ statusCode: 400, statusMessage: 'scheduledOffAtLocal must be "YYYY-MM-DD HH:mm"' })
    }
  }

  // const uploadDir = join(baseDir, 'cartoon-reorbit-images', 'packs')
  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'packs')
    : join(baseDir, 'public', 'packs')

  await mkdir(uploadDir, { recursive: true })
  const filename = `${Date.now()}_${imagePart.filename.replace(/[^A-Za-z0-9._-]/g, '')}`
  const outPath  = join(uploadDir, filename)
  await writeFile(outPath, imagePart.data)
  // const imagePath = `/images/packs/${filename}`
  const imagePath = process.env.NODE_ENV === 'production'
    ? `/images/packs/${filename}`
    : `/packs/${filename}`


  const result = await db.$transaction(async (tx) => {
    const pack = await tx.pack.create({
      data: {
        name: meta.name,
        price: meta.price ?? 0,
        description: meta.description ?? null,
        imagePath,
        inCmart: meta.inCmart ?? false,
        sellOutBehavior: meta.sellOutBehavior ?? 'REMOVE_ON_ANY_RARITY_EMPTY',
        scheduledAt,
        scheduledOffAt
      }
    })

    if (meta.rarityConfigs?.length) {
      const probabilities = meta.rarityConfigs.map(r => r.probabilityPercent)
      if (!probabilities.some(p => p === 100)) {
        throw createError({
          statusCode: 400,
          statusMessage: 'At least one rarity must have a 100% probability.'
        })
      }
      if (probabilities.some(p => p < 1 || p > 100)) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Probabilities must be between 1% and 100%.'
        })
      }

      await tx.packRarityConfig.createMany({
        data: meta.rarityConfigs.map(r => ({
          packId: pack.id,
          rarity: r.rarity,
          count: r.count,
          probabilityPercent: r.probabilityPercent
        }))
      })
    }

    if (meta.ctoonOptions?.length) {
      await tx.packCtoonOption.createMany({
        data: meta.ctoonOptions.map(o => ({
          packId: pack.id,
          ctoonId: o.ctoonId,
          weight: o.weight || 1
        }))
      })
    }

    return pack
  })

  return { id: result.id }
})
