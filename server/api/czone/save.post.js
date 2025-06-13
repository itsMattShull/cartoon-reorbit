// server/api/czone.post.js

import { defineEventHandler, readBody, createError } from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Auth check
  const user = event.context.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Parse & validate body
  // Expecting body: { zones: [ { background: string, toons: [ { id, x, y } ] }, { … }, { … } ] }
  const { zones } = await readBody(event)
  if (
    !Array.isArray(zones) ||
    zones.length !== 3 ||
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
        'Invalid request body: must provide `zones` as an array of 3 objects, each with a string `background` and array `toons`.',
    })
  }

  // 3. Fetch all UserCtoon records for this user, including their Ctoon
  const userCtoons = await prisma.userCtoon.findMany({
    where: { userId: user.id },
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
          quantity: true, // total supply (or null for unlimited)
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
        quantity: uc.ctoon.quantity,
        isFirstEdition: uc.isFirstEdition,
      },
    ])
  )

  // 4. Enrich & dedupe across all three zones
  const seenCtoonIds = new Set()
  const enrichedZones = []

  for (let i = 0; i < 3; i++) {
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

      if (!lookup.has(item.id)) {
        // user doesn't own this ctoon
        continue
      }

      const meta = lookup.get(item.id)
      const { baseCtoonId, ...rest } = meta

      // Skip if this ctoon (user-owned instance) is already placed in ANY zone
      if (seenCtoonIds.has(baseCtoonId)) {
        continue
      }
      seenCtoonIds.add(baseCtoonId)

      enrichedToons.push({
        id: item.id,
        x: item.x,
        y: item.y,
        mintNumber: rest.mintNumber,
        name: rest.name,
        assetPath: rest.assetPath,
        series: rest.series,
        set: rest.set,
        rarity: rest.rarity,
        releaseDate: rest.releaseDate,
        quantity: rest.quantity,
        isFirstEdition: rest.isFirstEdition,
      })
    }

    enrichedZones.push({
      background: zone.background,
      toons: enrichedToons,
    })
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
  return { success: true }
})
