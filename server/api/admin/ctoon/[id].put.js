// /api/admin/ctoon/[id].put.js
import {
  defineEventHandler,
  createError,
  readBody,
  readMultipartFormData
} from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { computeMultiHash, bucketFromHash } from '@/server/utils/multiHash'
import { scheduleMintEnd, cancelMintEnd } from '@/server/utils/queues'
import { parseSecondEditionFields } from '@/server/utils/secondEdition'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sanitizePathSegment, sanitizeFilename, assertInside, sniffImageType, MAX_IMAGE_BYTES } from '@/server/utils/imageUploadValidation'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { validateEffectSchema } from '@/server/utils/ogGtoonEffects'
import { parseGtoonCardStyleInput } from '@/server/utils/ogGtoonDisplay'
import { isStandardizableRarity, getStandardizedMetricPercentages, computeStandardizedQuantity } from '@/server/utils/cmartStandardizedMetrics'
import { getActivePlayerCount } from '@/server/utils/activePlayers'

const OG_GTOON_COLORS = new Set(['BLACK', 'SILVER', 'BLUE', 'RED', 'YELLOW', 'GREEN', 'PURPLE', 'ORANGE', 'PINK'])
const OG_GTOON_CARD_TYPES = new Set(['ANIMAL', 'FEMALE', 'HERO', 'MALE', 'MONSTER', 'PLACE', 'PROP', 'VEHICLE', 'VILLAIN'])
const OG_GTOON_GROUPS = new Set([
  'BEAN_SCOUTS', 'DAILY_PLANET', 'GLOBAL', 'IMAGINARY_FRIEND', 'INJUSTICE_GANG',
  'JUSTICE_FRIENDS', 'JUSTICE_LEAGUE', 'MUCHA_LUCHA', 'MYSTERY_INC', 'POWERPUFF_GIRLS',
  'SQUIRREL_SCOUTS', 'TEEN_TITANS', 'TIME_SQUAD', 'WOOHP'
])
const MAX_EFFECT_AMOUNT = 999

/** Blank/undefined -> null; otherwise must be one of `validSet`. Throws a 400 on anything else. */
function parseOptionalEnum(raw, validSet, label) {
  if (raw == null || raw === '') return null
  const v = String(raw).trim()
  if (!validSet.has(v)) throw createError({ statusCode: 400, statusMessage: `Invalid ${label}: ${v}` })
  return v
}

// paths
const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

export default defineEventHandler(async (event) => {
  const id = event.context.params.id

  // 1) Admin check
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  // Fetched early (not just at step 8) so the Standardize Metric clamp below can see
  // totalMinted before computing the new quantity; step 8 reuses this same row.
  const before = await prisma.ctoon.findUnique({ where: { id } })

  // 2) Accept JSON or multipart
  const contentType = (getRequestHeader(event, 'content-type') || '').toLowerCase()
  let payload = {}
  let imagePart = null
  let soundPart = null

  if (contentType.includes('multipart/form-data')) {
    const parts = await readMultipartFormData(event)
    for (const part of parts || []) {
      if (part.filename && part.name === 'sound') soundPart = part
      else if (part.filename) imagePart = part
      else payload[part.name] = Buffer.isBuffer(part.data) ? part.data.toString('utf-8') : part.data
    }
  } else {
    payload = await readBody(event)
  }

  // 3) Extract fields
  const {
    name, series, rarity, price, releaseDate, perUserLimit,
    quantity, initialQuantity, inCmart, set, description, characters,
    cMoonId: cMoonIdRaw, standardizeMetric: standardizeMetricRaw,
    isGtoon, cost, power, abilityKey, abilityData, gtoonType,
    isOgGtoon, gtoonColor, gtoonValue, isSlamGtoon, gtoonEffect, gtoonCardStyle,
    gtoonType1, gtoonType2, gtoonType3, gtoonGroup,
    initialReleaseAt, finalReleaseAt, initialReleaseQty, finalReleaseQty,
    clearSound,
    mintLimitType: mintLimitTypeRaw, mintEndDate: mintEndDateRaw,
    timeBasedLimitCount: timeBasedLimitCountRaw,
    timeBasedLimitWindowDays: timeBasedLimitWindowDaysRaw,

    isSecondEdition, relatedFirstEditionId,
    secondEditionOverlayX, secondEditionOverlayY, secondEditionOverlaySize
  } = payload

  // 4) Validate basics
  if (!name?.trim())   throw createError({ statusCode: 400, statusMessage: 'Name required.' })
  if (!series?.trim()) throw createError({ statusCode: 400, statusMessage: 'Series required.' })
  if (!rarity)         throw createError({ statusCode: 400, statusMessage: 'Rarity required.' })

  const newReleaseDate = new Date(releaseDate)
  let finalDelayHours = 12
  try {
    const cfg = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { finalReleaseDelayHours: true } })
    if (typeof cfg?.finalReleaseDelayHours === 'number') finalDelayHours = cfg.finalReleaseDelayHours
  } catch {}
  if (isNaN(newReleaseDate)) throw createError({ statusCode: 400, statusMessage: 'Invalid release date.' })

  // Validated before any file I/O so a bad cMoonId never leaves an orphaned
  // uploaded image on disk with no successful update to point to.
  const cMoonId = cMoonIdRaw && String(cMoonIdRaw).trim() ? String(cMoonIdRaw).trim() : null
  if (cMoonId) {
    const cMoonExists = await prisma.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true } })
    if (!cMoonExists) throw createError({ statusCode: 400, statusMessage: 'Selected cMoon does not exist.' })
  }

  // 5) Normalizations
  const priceInt    = price == null || price === '' ? 0 : Number(price)
  let qtyInt        = quantity == null || quantity === '' ? null : Number(quantity)
  let initQtyInt    = initialQuantity == null || initialQuantity === '' ? null : Number(initialQuantity)
  const perUserInt  = perUserLimit == null || perUserLimit === '' ? null : Number(perUserLimit)
  let inCmartBool   = String(inCmart) === 'true' || inCmart === true
  const isGtoonBool = String(isGtoon) === 'true' || isGtoon === true

  const standardizeMetricBool = String(standardizeMetricRaw) === 'true' || standardizeMetricRaw === true
  if (standardizeMetricBool) {
    if (!isStandardizableRarity(rarity)) {
      throw createError({ statusCode: 400, statusMessage: 'Standardize Metric is only available for Common, Uncommon, Rare, Very Rare, and Crazy Rare.' })
    }
    // codeOnly isn't editable via this endpoint (not in the payload, not in updateData below) —
    // read it off the existing row. Same invariant ctoon.post.js enforces at creation: a
    // Code-Only exclusive cToon must never also be forced into cMart.
    if (before?.codeOnly) {
      throw createError({ statusCode: 400, statusMessage: 'Cannot use Standardize Metric on a Code-Only cToon.' })
    }
    // Server-authoritative once standardized, same precedent as initialReleaseAt/finalReleaseAt
    // below: a standardized cToon is always in cMart with a defined (not time-based) limit,
    // regardless of what the client sent.
    inCmartBool = true
  }

  // Mint limit type
  const TIME_BASED_CAP = 999999999
  const mintLimitType = standardizeMetricBool ? 'defined' : (mintLimitTypeRaw === 'timeBased' ? 'timeBased' : 'defined')
  let mintEndDate = null
  if (mintLimitType === 'timeBased') {
    mintEndDate = mintEndDateRaw ? new Date(mintEndDateRaw) : null
    if (!mintEndDate || isNaN(mintEndDate)) {
      throw createError({ statusCode: 400, statusMessage: 'Mint End Date is required for Time Based Limit.' })
    }
  }

  // Standardize Metric: quantity is server-computed from the current active-player count and
  // this rarity's configured percentage, overriding whatever the client sent. Never shrinks
  // below copies already minted — a drop in the active-player count since this cToon was
  // created must not silently cap below what's already circulating.
  if (standardizeMetricBool) {
    const [activePlayerCount, percentages] = await Promise.all([
      getActivePlayerCount(),
      getStandardizedMetricPercentages()
    ])
    const computed = computeStandardizedQuantity(rarity, activePlayerCount, percentages, { floorAt: before?.totalMinted })
    qtyInt = computed
    initQtyInt = computed
  }

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

  // Original gToons
  const isOgGtoonBool = String(isOgGtoon) === 'true' || isOgGtoon === true
  const isSlamGtoonBool = isOgGtoonBool && (String(isSlamGtoon) === 'true' || isSlamGtoon === true)
  let gtoonValueInt = null
  let gtoonEffectArr = null
  const gtoonType1Val = parseOptionalEnum(gtoonType1, OG_GTOON_CARD_TYPES, 'Type 1')
  const gtoonType2Val = parseOptionalEnum(gtoonType2, OG_GTOON_CARD_TYPES, 'Type 2')
  const gtoonType3Val = parseOptionalEnum(gtoonType3, OG_GTOON_CARD_TYPES, 'Type 3')
  const gtoonGroupVal = parseOptionalEnum(gtoonGroup, OG_GTOON_GROUPS, 'Group')

  if (isOgGtoonBool) {
    if (!OG_GTOON_COLORS.has(gtoonColor)) {
      throw createError({ statusCode: 400, statusMessage: 'A valid gToon color is required.' })
    }
    gtoonValueInt = Number(gtoonValue)
    if (isNaN(gtoonValueInt) || gtoonValueInt < 0 || gtoonValueInt > 99) {
      throw createError({ statusCode: 400, statusMessage: 'gToon value must be between 0 and 99.' })
    }
    // A card's power (its effect) is independent of the Slam flag, so it is parsed, validated
    // and saved whenever one is sent. Slam is only the flag; an empty effect means no power.
    try {
      gtoonEffectArr = gtoonEffect
          ? (typeof gtoonEffect === 'string' ? JSON.parse(gtoonEffect) : gtoonEffect)
          : []
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'gToon effect must be valid JSON.' })
    }
    if (!Array.isArray(gtoonEffectArr)) {
      throw createError({ statusCode: 400, statusMessage: 'gToon effect must be a list of effects.' })
    }
    if (gtoonEffectArr.length === 0) {
      gtoonEffectArr = null
    } else {
      for (const e of gtoonEffectArr) {
        if (e?.action?.type === 'modifyValue') {
          e.action.amount = Math.max(-MAX_EFFECT_AMOUNT, Math.min(MAX_EFFECT_AMOUNT, Number(e.action.amount)))
        }
      }
      const { ok, errors: effectErrors } = validateEffectSchema(gtoonEffectArr)
      if (!ok) {
        throw createError({ statusCode: 400, statusMessage: `Invalid gToon effect: ${effectErrors.join('; ')}` })
      }
    }
  }

  const secondEdition = await parseSecondEditionFields(
    { isSecondEdition, relatedFirstEditionId, secondEditionOverlayX, secondEditionOverlayY, secondEditionOverlaySize },
    prisma,
    id
  )

  // 6) Build update payload
  const updateData = {
    name: name.trim(),
    series: series.trim(),
    rarity,
    price: priceInt,
    releaseDate: newReleaseDate,
    perUserLimit: perUserInt,
    quantity: mintLimitType === 'timeBased' ? TIME_BASED_CAP : qtyInt,
    initialQuantity: mintLimitType === 'timeBased' ? TIME_BASED_CAP : initQtyInt,
    mintLimitType,
    mintEndDate,
    standardizeMetric: standardizeMetricBool,
    inCmart: inCmartBool,
    set,
    description: description?.trim() || null,
    characters: charactersArr,
    cMoonId,

    isGtoon:    isGtoonBool,
    gtoonType:  isGtoonBool ? (gtoonType?.toString().trim() || null) : null,
    cost:       isGtoonBool ? costInt : null,
    power:      isGtoonBool ? powerInt : null,
    abilityKey: isGtoonBool ? abilityKey : null,
    abilityData: isGtoonBool ? abilityDataObj : null,

    isOgGtoon:   isOgGtoonBool,
    gtoonColor:  isOgGtoonBool ? gtoonColor : null,
    gtoonValue:  isOgGtoonBool ? gtoonValueInt : null,
    isSlamGtoon: isSlamGtoonBool,
    gtoonEffect: gtoonEffectArr,
    gtoonCardStyle: isOgGtoonBool ? parseGtoonCardStyleInput(gtoonCardStyle) : null,
    gtoonType1: isOgGtoonBool ? gtoonType1Val : null,
    gtoonType2: isOgGtoonBool ? gtoonType2Val : null,
    gtoonType3: isOgGtoonBool ? gtoonType3Val : null,
    gtoonGroup: isOgGtoonBool ? gtoonGroupVal : null,

    // Second Edition fields
    isSecondEdition: secondEdition.isSecondEdition,
    relatedFirstEditionId: secondEdition.relatedFirstEditionId,
    secondEditionOverlayX: secondEdition.secondEditionOverlayX,
    secondEditionOverlayY: secondEdition.secondEditionOverlayY,
    secondEditionOverlaySize: secondEdition.secondEditionOverlaySize,

    // advisory schedule fields
    // server-authoritative: derived from releaseDate + configured delay
    initialReleaseAt: newReleaseDate,
    finalReleaseAt:   new Date(newReleaseDate.getTime() + finalDelayHours * 60 * 60 * 1000),
    initialReleaseQty: initialReleaseQty == null || initialReleaseQty === '' ? null : Number(initialReleaseQty),
    finalReleaseQty:   finalReleaseQty   == null || finalReleaseQty   === '' ? null : Number(finalReleaseQty),

    // Time-based purchase limit overrides (only meaningful for timeBased; cleared for defined)
    timeBasedLimitCount:      mintLimitType === 'timeBased' && timeBasedLimitCountRaw      != null && timeBasedLimitCountRaw      !== '' ? Number(timeBasedLimitCountRaw)      : null,
    timeBasedLimitWindowDays: mintLimitType === 'timeBased' && timeBasedLimitWindowDaysRaw != null && timeBasedLimitWindowDaysRaw !== '' ? Number(timeBasedLimitWindowDaysRaw) : null
  }

  let imageHashData = null

  // 7) Optional image save with timestamped filename
  if (imagePart) {
    if (!['image/png','image/gif','image/avif'].includes(imagePart.type)) {
      throw createError({ statusCode: 400, statusMessage: 'PNG, GIF, or AVIF only.' })
    }

    const { phash, dhash } = await computeMultiHash(imagePart.data)
    imageHashData = { phash, dhash, bucket: bucketFromHash(phash) }

    const safeSeries = sanitizePathSegment(series)
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

  // 7b) Optional sound save
  const ALLOWED_AUDIO = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg'])
  if (soundPart) {
    if (!ALLOWED_AUDIO.has(soundPart.type)) {
      throw createError({ statusCode: 400, statusMessage: 'Sound must be MP3, WAV, or OGG.' })
    }
    const safeSeries = sanitizePathSegment(series)
    const soundUploadDir = process.env.NODE_ENV === 'production'
      ? join(baseDir, 'cartoon-reorbit-images', 'cToon-sounds', safeSeries)
      : join(baseDir, 'public', 'cToon-sounds', safeSeries)
    await mkdir(soundUploadDir, { recursive: true })
    const soundExt = extname(soundPart.filename || '') || '.mp3'
    const soundBase = basename(soundPart.filename || 'sound', soundExt) || 'sound'
    const soundFilename = `${soundBase}-${Date.now()}${soundExt}`
    await writeFile(join(soundUploadDir, soundFilename), soundPart.data)
    updateData.soundPath = process.env.NODE_ENV === 'production'
      ? `/images/cToon-sounds/${safeSeries}/${soundFilename}`
      : `/cToon-sounds/${safeSeries}/${soundFilename}`
  } else if (String(clearSound) === 'true' || clearSound === true) {
    updateData.soundPath = null
  }

  // 8) Persist (before was already fetched above, ahead of the Standardize Metric clamp)
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

  // First Edition status is derived from isSecondEdition — if it changed, sync
  // already-minted UserCtoon rows for this cToon (scoped to this ctoonId, index-backed,
  // skips rows that already match to avoid a no-op write storm).
  if (before && before.isSecondEdition !== updated.isSecondEdition) {
    await prisma.$executeRaw`
      UPDATE "UserCtoon"
      SET "isFirstEdition" = ${!updated.isSecondEdition}
      WHERE "ctoonId" = ${id} AND "isFirstEdition" IS DISTINCT FROM ${!updated.isSecondEdition}
    `
  }

  // 9) Log field-level changes
  try {
    const area = `Ctoon:${id}`
    const keys = [
      'name','series','description','rarity','price','releaseDate','perUserLimit','quantity','initialQuantity','standardizeMetric','inCmart','set','characters','cMoonId',
      'isGtoon','gtoonType','cost','power','abilityKey','abilityData','assetPath','type','soundPath',
      'isOgGtoon','gtoonColor','gtoonValue','isSlamGtoon','gtoonEffect','gtoonCardStyle',
      'gtoonType1','gtoonType2','gtoonType3','gtoonGroup',
      'initialReleaseAt','finalReleaseAt','initialReleaseQty','finalReleaseQty',
      'mintLimitType','mintEndDate',
      'timeBasedLimitCount','timeBasedLimitWindowDays',
      'isSecondEdition','relatedFirstEditionId','secondEditionOverlayX','secondEditionOverlayY','secondEditionOverlaySize'
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

  // 10) Schedule or cancel mint-end job based on mint limit type change
  try {
    if (mintLimitType === 'timeBased' && mintEndDate) {
      await scheduleMintEnd(id, mintEndDate)
    } else if (mintLimitType === 'defined') {
      await cancelMintEnd(id)
    }
  } catch (err) {
    console.error(`[ctoon.put] Failed to manage mint-end job for ${id}:`, err)
  }

  return { success: true, ctoon: updated }
})
