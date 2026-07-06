// server/api/admin/ctoons/make-second-edition.post.js
// Bulk-creates Second Edition duplicates of the given cToons: same values
// (including assetPath/image) as the original, but a new Set name, fresh
// mint counters, and the isSecondEdition/relatedFirstEditionId pairing.
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { scheduleMintEnd } from '@/server/utils/queues'

const MAX_BATCH = 150
const TIME_BASED_CAP = 999999999
const MAX_SET_NAME_LEN = 191

function toNonNegIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

export default defineEventHandler(async (event) => {
  // 1) Admin check
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

  // 2) Parse + validate body
  const body = await readBody(event)

  const setName = String(body?.setName || '').trim().slice(0, MAX_SET_NAME_LEN)
  if (!setName) {
    throw createError({ statusCode: 400, statusMessage: 'Set Name is required.' })
  }

  const inCmart = body?.inCmart === true
  const releaseDate = body?.releaseDate ? new Date(body.releaseDate) : null
  if (!releaseDate || isNaN(releaseDate)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid Release DateTime is required.' })
  }
  if (releaseDate <= new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'Release DateTime must be in the future.' })
  }

  const rawRecords = Array.isArray(body?.records) ? body.records : []
  const seen = new Set()
  const records = []
  for (const r of rawRecords) {
    const id = String(r?.id || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    records.push({ ...r, id })
  }
  if (!records.length) return { success: true, created: [], errors: [] }
  if (records.length > MAX_BATCH) {
    throw createError({
      statusCode: 400,
      statusMessage: `Too many records in one request (max ${MAX_BATCH}) — narrow your filter and try again.`,
    })
  }

  const ids = records.map(r => r.id)

  // 3) Batch pre-fetch originals + existing pairings (avoids per-row N+1 lookups)
  const [originals, pairedRows] = await Promise.all([
    prisma.ctoon.findMany({ where: { id: { in: ids } }, include: { imageHash: true } }),
    prisma.ctoon.findMany({
      where: { relatedFirstEditionId: { in: ids } },
      select: { relatedFirstEditionId: true },
    }),
  ])
  const originalsById = new Map(originals.map(o => [o.id, o]))
  const alreadyPaired = new Set(pairedRows.map(p => p.relatedFirstEditionId))

  const batchId = randomUUID()
  const created = []
  const errors = []

  for (const rec of records) {
    const original = originalsById.get(rec.id)
    if (!original) { errors.push({ id: rec.id, error: 'Not found' }); continue }
    if (original.isSecondEdition) {
      errors.push({ id: rec.id, name: original.name, error: 'Already a Second Edition' })
      continue
    }
    if (alreadyPaired.has(rec.id)) {
      errors.push({ id: rec.id, name: original.name, error: 'Already has a Second Edition' })
      continue
    }
    if (inCmart && original.codeOnly) {
      errors.push({ id: rec.id, name: original.name, error: 'Cannot be Code-Only and in C-mart' })
      continue
    }

    const mintLimitType = rec.mintLimitType === 'timeBased' ? 'timeBased' : 'defined'
    let mintEndDate = null
    if (mintLimitType === 'timeBased') {
      mintEndDate = rec.mintEndDate ? new Date(rec.mintEndDate) : null
      if (!mintEndDate || isNaN(mintEndDate)) {
        errors.push({ id: rec.id, name: original.name, error: 'Mint End Date is required for Time Based Limit.' })
        continue
      }
    }

    const quantity = mintLimitType === 'timeBased' ? TIME_BASED_CAP : toNonNegIntOrNull(rec.quantity)
    const initialQuantity = mintLimitType === 'timeBased' ? TIME_BASED_CAP : toNonNegIntOrNull(rec.initialQuantity)
    const perUserLimit = toNonNegIntOrNull(rec.perUserLimit)
    if (initialQuantity != null && quantity != null && initialQuantity > quantity) {
      errors.push({ id: rec.id, name: original.name, error: 'Initial quantity cannot exceed total quantity.' })
      continue
    }

    try {
      const newCtoon = await prisma.ctoon.create({
        data: {
          // Copied verbatim from the first edition
          name: original.name,
          series: original.series,
          description: original.description,
          type: original.type,
          rarity: original.rarity,
          assetPath: original.assetPath,
          soundPath: original.soundPath,
          price: original.price,
          codeOnly: original.codeOnly,
          characters: original.characters,
          isGtoon: original.isGtoon,
          gtoonType: original.gtoonType,
          cost: original.cost,
          power: original.power,
          abilityKey: original.abilityKey,
          abilityData: original.abilityData,

          // Batch-level overrides (apply the same value to every created record)
          set: setName,
          inCmart,
          releaseDate,

          // Fresh mint pool — starts at 0 minted regardless of the original's counts
          quantity,
          initialQuantity,
          perUserLimit,
          mintLimitType,
          mintEndDate,
          totalMinted: 0,

          // Two-phase release scheduling doesn't carry forward to a re-release
          initialReleaseAt: null,
          finalReleaseAt: null,
          initialReleaseQty: null,
          finalReleaseQty: null,
          timeBasedLimitCount: mintLimitType === 'timeBased' ? original.timeBasedLimitCount : null,
          timeBasedLimitWindowDays: mintLimitType === 'timeBased' ? original.timeBasedLimitWindowDays : null,

          // Second Edition pairing
          isSecondEdition: true,
          relatedFirstEditionId: original.id,
          secondEditionOverlayX: 75,
          secondEditionOverlayY: 75,
          secondEditionOverlaySize: 100,

          imageHash: original.imageHash
            ? {
                create: {
                  phash: original.imageHash.phash,
                  dhash: original.imageHash.dhash,
                  bucket: original.imageHash.bucket,
                },
              }
            : undefined,
        },
      })

      try {
        await logAdminChange(prisma, {
          userId: me.id,
          area: `Ctoon:${newCtoon.id}`,
          key: 'create-second-edition',
          prevValue: null,
          newValue: { batchId, relatedFirstEditionId: original.id, name: newCtoon.name, set: setName },
        })
      } catch {}

      if (mintLimitType === 'timeBased' && mintEndDate) {
        try {
          await scheduleMintEnd(newCtoon.id, mintEndDate)
        } catch (err) {
          console.error(`[make-second-edition] Failed to schedule mint-end for ${newCtoon.id}:`, err)
        }
      }

      created.push({ id: newCtoon.id, originalId: original.id, name: newCtoon.name })
    } catch (err) {
      errors.push({ id: rec.id, name: original.name, error: err.message || 'Create failed' })
    }
  }

  return { success: true, count: created.length, created, errors }
})
