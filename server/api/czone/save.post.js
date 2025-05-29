// server/api/czone.post.js

import { PrismaClient } from '@prisma/client'
import { defineEventHandler, readBody, createError } from 'h3'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  // 1. Auth check
  const user = event.context.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Parse & validate body
  const { layout, background } = await readBody(event)
  if (!Array.isArray(layout) || typeof background !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
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

  // Build a map: userCtoonId -> metadata (+ underlying ctoonId for dedup)
  const lookup = new Map(
    userCtoons.map((uc) => [
      uc.id,
      {
        // duplicate-detection key
        baseCtoonId: uc.ctoon.id,

        // data to merge into layout items
        mintNumber: uc.mintNumber,
        name: uc.ctoon.name,
        assetPath: uc.ctoon.assetPath,
        series: uc.ctoon.series,
        set: uc.ctoon.set,
        rarity: uc.ctoon.rarity,
        releaseDate: uc.ctoon.releaseDate,
        quantity: uc.ctoon.quantity, // null → unlimited
        isFirstEdition: uc.isFirstEdition,
      },
    ])
  )

  // 4. Filter, dedupe (by underlying ctoonId), and enrich layout items
  const seenCtoonIds = new Set()
  const enrichedLayout = []

  for (const item of layout) {
    if (!lookup.has(item.id)) continue // unknown or not owned

    const meta = lookup.get(item.id)
    const { baseCtoonId, ...rest } = meta

    // Skip if we've already placed a copy of this ctoon
    if (seenCtoonIds.has(baseCtoonId)) continue
    seenCtoonIds.add(baseCtoonId)

    enrichedLayout.push({
      ...item,
      ...rest,
    })
  }

  // 5. Upsert the CZone
  await prisma.cZone.upsert({
    where: { userId: user.id },
    update: {
      layoutData: enrichedLayout,
      background,
    },
    create: {
      userId: user.id,
      layoutData: enrichedLayout,
      background,
    },
  })

  return { success: true }
})
