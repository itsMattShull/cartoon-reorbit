// server/api/admin/packs.post.js
// Creates a Pack, saves its thumbnail to /public/packs/ and records rarity + cToon options.
// Accepts multipart/form‑data with:
//   • field "meta"   – JSON string of the pack metadata (name, price, etc.)
//   • field "image"  – PNG or JPEG file

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

/* ── Prisma singleton ─────────────────────────────────────────────── */
let prisma
function db () {
  if (!prisma) prisma = new PrismaClient()
  return prisma
}

/* ── Determine upload base dir (project root) ─────────────────────── */
const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..')  // two levels up from /server/api/…
  : process.cwd()

/* ── Helper: validate meta payload ─────────────────────────────────── */
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
  if (dupRarity) throw createError({ statusCode: 400, statusMessage: `Duplicate rarity "${dupRarity}"` })
  const dupCtoon = meta.ctoonOptions.map(o => o.ctoonId).find((r, i, a) => a.indexOf(r) !== i)
  if (dupCtoon) throw createError({ statusCode: 400, statusMessage: `Duplicate cToon "${dupCtoon}"` })
}

/* ── Route handler ────────────────────────────────────────────────── */
export default defineEventHandler(async (event) => {
  /* 1️⃣  Admin auth */
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

  /* 2️⃣  Parse multipart/form‑data */
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

  /* 3️⃣  Save image under /public/packs */
  const uploadDir = join(baseDir, 'public', 'packs')
  await mkdir(uploadDir, { recursive: true })
  const filename = `${Date.now()}_${imagePart.filename.replace(/[^A-Za-z0-9._-]/g, '')}`
  const outPath  = join(uploadDir, filename)
  await writeFile(outPath, imagePart.data)
  const imagePath = `/packs/${filename}`

  /* 4️⃣  Persist in DB */
  const result = await db().$transaction(async (tx) => {
    const pack = await tx.pack.create({
      data: {
        name: meta.name,
        price: meta.price ?? 0,
        description: meta.description ?? null,
        imagePath,
        inCmart: meta.inCmart ?? false
      }
    })

    if (meta.rarityConfigs?.length) {
      await tx.packRarityConfig.createMany({
        data: meta.rarityConfigs.map(r => ({
          packId: pack.id,
          rarity: r.rarity,
          count: r.count
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

  /* 5️⃣  Respond */
  return { id: result.id }
})
