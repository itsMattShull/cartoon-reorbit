// server/api/admin/packs/[id].patch.js
// PATCH /api/admin/packs/:id
// Accepts multipart/form-data with:
//
//   meta   – JSON string:
//            {
//              name, price, description, inCmart,
//              rarityConfigs: [ { rarity,count,probabilityPercent } ],
//              ctoonOptions : [ { ctoonId, weight } ]
//            }
//   image  – optional PNG / JPEG thumbnail
//
// Notes
// ──────────────────────────────────────────────────────────────
// • All writes happen in a single transaction.
// • We delete old PackRarityConfig / PackCtoonOption rows, then
//   recreate them from the payload.
// • Each new PackCtoonOption weight is validated (1-100) and we
//   console.log the cToon’s name + weight as we go.
// • deleteMany returns {count}; we log that too.

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

/* ───────────── paths ───────────── */
const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir   = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()
const packUploadDir = process.env.NODE_ENV === 'production'
  ? join(rootDir, 'cartoon-reorbit-images', 'packs')
  : join(rootDir, 'public', 'packs')

/* ───────────── helpers ─────────── */
async function assertAdmin (event) {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } })
    .catch(() => null)
  if (!me)           throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (!me.isAdmin)   throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
}

function validateMeta (meta) {
  if (!meta?.name?.trim())                throw createError({ statusCode: 400, statusMessage: 'Missing name' })
  if (!Array.isArray(meta.rarityConfigs)) throw createError({ statusCode: 400, statusMessage: 'rarityConfigs array required' })
  if (!Array.isArray(meta.ctoonOptions))  throw createError({ statusCode: 400, statusMessage: 'ctoonOptions array required' })

  const dupRarity = meta.rarityConfigs.map(r => r.rarity)
    .find((r,i,a) => a.indexOf(r) !== i)
  if (dupRarity) throw createError({ statusCode: 400, statusMessage: `Duplicate rarity "${dupRarity}"` })

  const dupCtoon = meta.ctoonOptions.map(o => o.ctoonId)
    .find((r,i,a) => a.indexOf(r) !== i)
  if (dupCtoon) throw createError({ statusCode: 400, statusMessage: `Duplicate cToon "${dupCtoon}"` })

  const probs = meta.rarityConfigs.map(r => r.probabilityPercent)
  if (!probs.some(p => p === 100)) throw createError({ statusCode: 400, statusMessage: 'At least one rarity must have 100% probability' })
  if (probs.some(p => p < 1 || p > 100)) throw createError({ statusCode: 400, statusMessage: 'Probabilities must be 1–100' })
}

/* ─────────── main handler ───────── */
export default defineEventHandler(async (event) => {
  await assertAdmin(event)

  const packId = event.context.params.id
  if (!packId) throw createError({ statusCode: 400, statusMessage: 'Missing id param' })

  /* ── parse formdata ───────────────────────── */
  const parts = await readMultipartFormData(event)
  let imagePart = null, metaPart = null
  for (const p of parts) {
    if (p.filename)     imagePart = p
    else if (p.name === 'meta') metaPart = p
  }
  if (!metaPart) throw createError({ statusCode: 400, statusMessage: 'Missing meta field' })

  let meta
  try { meta = JSON.parse(metaPart.data.toString()) }
  catch { throw createError({ statusCode: 400, statusMessage: 'meta must be valid JSON' }) }

  validateMeta(meta)

  /* ── optional thumbnail upload ─────────────── */
  let imagePath = null
  if (imagePart) {
    if (!['image/png','image/jpeg'].includes(imagePart.type))
      throw createError({ statusCode: 400, statusMessage: 'Only PNG or JPEG images allowed' })
    await mkdir(packUploadDir, { recursive: true })
    const fname = `${Date.now()}_${imagePart.filename}`
    await writeFile(join(packUploadDir, fname), imagePart.data)
    imagePath = process.env.NODE_ENV === 'production'
      ? `/images/packs/${fname}`
      : `/packs/${fname}`
  }

  /* ── DB transaction ────────────────────────── */
  const result = await db.$transaction(async (tx) => {
    /* update pack row */
    await tx.pack.update({
      where: { id: packId },
      data: {
        name:        meta.name.trim(),
        price:       meta.price ?? 0,
        description: meta.description ?? null,
        inCmart:     !!meta.inCmart,
        ...(imagePath ? { imagePath } : {})
      }
    })

    /* replace rarity configs */
    await tx.packRarityConfig.deleteMany({ where: { packId } })
    await tx.packRarityConfig.createMany({
      data: meta.rarityConfigs.map(r => ({
        packId,
        rarity: r.rarity,
        count:  r.count,
        probabilityPercent: r.probabilityPercent
      }))
    })

    /* delete old options & log count */
    const { count: deletedCount } = await tx.packCtoonOption.deleteMany({ where: { packId } })

    /* fetch names for logging */
    const idList   = meta.ctoonOptions.map(o => o.ctoonId)
    const nameRows = await tx.ctoon.findMany({
      where: { id: { in: idList } },
      select: { id: true, name: true }
    })
    const nameMap = Object.fromEntries(nameRows.map(r => [r.id, r.name]))

    /* build & validate new options */
    const optionData = meta.ctoonOptions.map(o => {
      const w = Number(o.weight)
      if (isNaN(w) || w < 1 || w > 100)
        throw createError({ statusCode: 400, statusMessage: `Invalid weight "${o.weight}" for cToon ${o.ctoonId}` })

      return { packId, ctoonId: o.ctoonId, weight: w }
    })

    await tx.packCtoonOption.createMany({ data: optionData })

    return { id: packId }
  })

  return { id: result.id, imagePath }
})
