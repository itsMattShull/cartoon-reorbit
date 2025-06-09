// server/api/admin/packs/[id].patch.js
// Update a Pack. Accepts multipart/form-data:
//
//   meta   – JSON string, shape:
//            {
//              name, price, description, inCmart,
//              rarityConfigs: [ { rarity,count,probabilityPercent } ],
//              ctoonOptions : [ { ctoonId, weight } ]
//            }
//   image  – (optional) PNG or JPEG thumbnail

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

let prisma
function db () {
  if (!prisma) prisma = new PrismaClient()
  return prisma
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()
const packUploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'packs')
    : join(baseDir, 'public', 'packs')

async function assertAdmin (event) {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}

function validateMeta (meta) {
  if (!meta?.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing name' })
  }
  if (!Array.isArray(meta.rarityConfigs) || !meta.rarityConfigs.length) {
    throw createError({ statusCode: 400, statusMessage: 'rarityConfigs array required' })
  }
  if (!Array.isArray(meta.ctoonOptions) || !meta.ctoonOptions.length) {
    throw createError({ statusCode: 400, statusMessage: 'ctoonOptions array required' })
  }
  const dupRarity = meta.rarityConfigs.map(r => r.rarity)
    .find((r, i, a) => a.indexOf(r) !== i)
  if (dupRarity) {
    throw createError({ statusCode: 400, statusMessage: `Duplicate rarity "${dupRarity}"` })
  }
  const dupCtoon = meta.ctoonOptions.map(o => o.ctoonId)
    .find((r, i, a) => a.indexOf(r) !== i)
  if (dupCtoon) {
    throw createError({ statusCode: 400, statusMessage: `Duplicate cToon "${dupCtoon}"` })
  }
  const probabilities = meta.rarityConfigs.map(r => r.probabilityPercent)
  if (!probabilities.some(p => p === 100)) {
    throw createError({ statusCode: 400, statusMessage: 'At least one rarity must have a 100% probability.' })
  }
  if (probabilities.some(p => p < 1 || p > 100)) {
    throw createError({ statusCode: 400, statusMessage: 'Probabilities must be between 1% and 100%.' })
  }
}

export default defineEventHandler(async (event) => {
  await assertAdmin(event)

  const id = event.context.params.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const parts = await readMultipartFormData(event)
  let imagePart = null
  let metaPart  = null
  for (const p of parts) {
    if (p.filename) imagePart = p
    else if (p.name === 'meta') metaPart = p
  }
  if (!metaPart) {
    throw createError({ statusCode: 400, statusMessage: 'Missing meta field' })
  }

  let meta
  try { meta = JSON.parse(metaPart.data.toString()) }
  catch { throw createError({ statusCode: 400, statusMessage: 'meta must be valid JSON' }) }
  validateMeta(meta)

  let imagePath = null
  if (imagePart) {
    if (!['image/png', 'image/jpeg'].includes(imagePart.type)) {
      throw createError({ statusCode: 400, statusMessage: 'Only PNG or JPEG images allowed' })
    }
    await mkdir(packUploadDir, { recursive: true })
    const filename  = `${Date.now()}_${imagePart.filename}`
    const outPath   = join(packUploadDir, filename)
    await writeFile(outPath, imagePart.data)
    imagePath = process.env.NODE_ENV === 'production'
    ? `/images/packs/${filename}`
    : `/packs/${filename}`
  }

  const result = await db().$transaction(async (tx) => {
    await tx.pack.update({
      where: { id },
      data: {
        name:        meta.name.trim(),
        price:       meta.price ?? 0,
        description: meta.description ?? null,
        inCmart:     !!meta.inCmart,
        ...(imagePath ? { imagePath } : {})
      }
    })

    await tx.packRarityConfig.deleteMany({ where: { packId: id } })
    await tx.packRarityConfig.createMany({
      data: meta.rarityConfigs.map(r => ({
        packId: id,
        rarity: r.rarity,
        count:  r.count,
        probabilityPercent: r.probabilityPercent
      }))
    })

    await tx.packCtoonOption.deleteMany({ where: { packId: id } })
    await tx.packCtoonOption.createMany({
      data: meta.ctoonOptions.map(o => ({
        packId: id,
        ctoonId: o.ctoonId,
        weight:  o.weight || 1
      }))
    })

    return { id }
  })

  return { id: result.id, imagePath }
})
