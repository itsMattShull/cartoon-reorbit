// server/api/czone.post.js

import { defineEventHandler, readBody, createError } from 'h3'

import { prisma, rawPrisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { isSyntheticUserCtoonId } from '@/server/utils/userCtoonId'
import { NAV_CACHE_KEY } from './[username]/next.get.js'

export default defineEventHandler(async (event) => {
  // 1. Auth check
  const user = event.context.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Parse & validate body
  // Expecting body: { zones: [ { background: string, toons: [ { id, x, y } ] }, ... ] }
  const { zones } = await readBody(event)
  const config = await prisma.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { czoneCount: true }
  })
  const userRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: { additionalCzones: true }
  })
  const baseCount = Number(config?.czoneCount ?? 3)
  const extraCount = Math.max(0, Number(userRecord?.additionalCzones ?? 0))
  let maxZones = Math.max(1, baseCount + extraCount)
  const existing = await prisma.cZone.findUnique({
    where: { userId: user.id },
    select: { layoutData: true }
  })
  if (
    existing?.layoutData &&
    typeof existing.layoutData === 'object' &&
    Array.isArray(existing.layoutData.zones)
  ) {
    maxZones = Math.max(maxZones, existing.layoutData.zones.length)
  }
  if (
    !Array.isArray(zones) ||
    zones.length < 1 ||
    zones.length > maxZones ||
    !zones.every(
      (z) =>
        typeof z === 'object' &&
        typeof z.background === 'string' &&
        Array.isArray(z.toons)
    )
  ) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'Invalid request body: must provide `zones` as an array of objects (1..max), each with a string `background` and array `toons`.',
    })
  }

  // 3. Fetch only the UserCtoon records being placed (not the entire collection)
  //
  // Collection items carry synthetic IDs (uc|userId|ctoonId|mintNumber) rather
  // than real DB UUIDs. Resolve them to real IDs before querying.
  const rawItemIds = new Set()
  for (const zone of zones) {
    for (const item of zone.toons) {
      if (typeof item?.id === 'string') rawItemIds.add(item.id)
    }
  }

  // Build a map from whatever ID the client sent → real userCtoon DB id
  const idResolutionMap = new Map()
  const syntheticToResolve = []
  for (const id of rawItemIds) {
    if (isSyntheticUserCtoonId(id)) {
      syntheticToResolve.push(id)
    } else {
      idResolutionMap.set(id, id)
    }
  }

  if (syntheticToResolve.length > 0) {
    const parsed = syntheticToResolve.map(id => {
      const [, synthUserId, ctoonId, mintStr] = id.split('|')
      const mintNumber = mintStr === 'x' ? null : parseInt(mintStr, 10)
      return { syntheticId: id, synthUserId, ctoonId, mintNumber }
    }).filter(p => p.synthUserId === user.id)

    if (parsed.length > 0) {
      const recs = await rawPrisma.userCtoon.findMany({
        where: {
          userId: user.id,
          burnedAt: null,
          OR: parsed.map(p => ({ ctoonId: p.ctoonId, mintNumber: p.mintNumber }))
        },
        select: { id: true, ctoonId: true, mintNumber: true }
      })
      const recMap = new Map(recs.map(r => [`${r.ctoonId}|${r.mintNumber ?? 'x'}`, r.id]))
      for (const p of parsed) {
        const realId = recMap.get(`${p.ctoonId}|${p.mintNumber ?? 'x'}`)
        if (realId) idResolutionMap.set(p.syntheticId, realId)
      }
    }
  }

  const resolvedIds = new Set(idResolutionMap.values())

  // Use rawPrisma (unextended client) so April Fools asset swaps are never
  // persisted into the cZone layout — we always store the real assetPath.
  const userCtoons = await rawPrisma.userCtoon.findMany({
    where: { userId: user.id, id: { in: Array.from(resolvedIds) } },
    select: {
      id: true,
      mintNumber: true,
      isFirstEdition: true,
      ctoon: {
        select: {
          id: true,
          name: true,
          assetPath: true,
          series: true,
          set: true,
          rarity: true,
          releaseDate: true,
          isGtoon: true,
          cost: true,
          power: true,
          quantity: true, // total supply (or null for unlimited)
          characters: true,
        },
      },
    },
  })

  // Build a map: userCtoonId -> metadata
  const lookup = new Map(
    userCtoons.map((uc) => [
      uc.id,
      {
        baseCtoonId: uc.id,
        mintNumber: uc.mintNumber,
        name: uc.ctoon.name,
        assetPath: uc.ctoon.assetPath,
        series: uc.ctoon.series,
        set: uc.ctoon.set,
        rarity: uc.ctoon.rarity,
        releaseDate: uc.ctoon.releaseDate,
        isGtoon: uc.ctoon.isGtoon,
        cost: uc.ctoon.cost,
        power: uc.ctoon.power,
        quantity: uc.ctoon.quantity,
        isFirstEdition: uc.isFirstEdition,
        characters: uc.ctoon.characters,
      },
    ])
  )

  // 4. Enrich & dedupe across all zones
  const seenCtoonIds = new Set()
  const enrichedZones = []

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i]
    const enrichedToons = []

    for (const item of zone.toons) {
      // Each `item` should be { id: string, x: number, y: number }
      if (
        typeof item !== 'object' ||
        typeof item.id !== 'string' ||
        typeof item.x !== 'number' ||
        typeof item.y !== 'number'
      ) {
        // skip invalid entries
        continue
      }

      const realId = idResolutionMap.get(item.id) ?? item.id
      if (!lookup.has(realId)) {
        // user doesn't own this ctoon
        continue
      }

      const meta = lookup.get(realId)
      const { baseCtoonId, ...rest } = meta

      // Skip if this ctoon (user-owned instance) is already placed in ANY zone
      if (seenCtoonIds.has(baseCtoonId)) {
        continue
      }
      seenCtoonIds.add(baseCtoonId)

      const entry = {
        id: realId,
        x: item.x,
        y: item.y,
        mintNumber: rest.mintNumber,
        name: rest.name,
        assetPath: rest.assetPath,
        series: rest.series,
        set: rest.set,
        rarity: rest.rarity,
        releaseDate: rest.releaseDate,
        isGtoon: rest.isGtoon,
        cost: rest.cost,
        power: rest.power,
        quantity: rest.quantity,
        isFirstEdition: rest.isFirstEdition,
        characters: rest.characters,
      }
      // Persist display-only properties: size scale and natural image dimensions
      if (item.sizeScale === 0.5 || item.sizeScale === 2) entry.sizeScale = item.sizeScale
      if (typeof item.width  === 'number' && item.width  > 0) entry.width  = Math.round(item.width)
      if (typeof item.height === 'number' && item.height > 0) entry.height = Math.round(item.height)
      enrichedToons.push(entry)
    }

    enrichedZones.push({
      background: zone.background,
      toons: enrichedToons,
    })
  }
  while (enrichedZones.length < maxZones) {
    enrichedZones.push({ background: '', toons: [] })
  }

  // 5. Upsert the CZone
  // We’ll store the entire `zones` array under `layoutData`. We also update the old `background` column
  // to reflect zone 0’s background (so nothing breaks if other parts of the code still read it).
  const upsertData = {
    layoutData: { zones: enrichedZones },
    background: enrichedZones[0]?.background || '',
  }
  await prisma.cZone.upsert({
    where: { userId: user.id },
    update: upsertData,
    create: {
      userId: user.id,
      ...upsertData
    },
  })

  // Invalidate the cZone nav cache so next/previous picks up layout changes
  try { await redis.del(NAV_CACHE_KEY) } catch {}

  return { success: true }
})
