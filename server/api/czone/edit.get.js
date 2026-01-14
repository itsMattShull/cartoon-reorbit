// server/api/czone.edit.js

import { promises as fs } from 'fs'
import path from 'path'
import { defineEventHandler, createError } from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 1) Fetch all cToons the user owns
  const owned = await prisma.userCtoon.findMany({
    where: { userId: user.id },
    include: { ctoon: true },
    orderBy: {
      createdAt: 'desc',
    },
  })
  const ctoons = owned.map((uc) => ({
    id: uc.id,
    name: uc.ctoon.name,
    series: uc.ctoon.series,
    rarity: uc.ctoon.rarity,
    set: uc.ctoon.set,
    isFirstEdition: uc.isFirstEdition,
    releaseDate: uc.ctoon.releaseDate,
    assetPath: uc.ctoon.assetPath,
    characters: Array.isArray(uc.ctoon.characters) ? uc.ctoon.characters : []
  }))

  // 2) List all background filenames
  const backgroundsDir = path.join(process.cwd(), 'public', 'backgrounds')
  const files = await fs.readdir(backgroundsDir)
  const backgrounds = files.filter((file) =>
    /\.(png|jpe?g|gif|webp)$/i.test(file)
  )

  // 3) Load the single CZone row (if it exists)
  const zone = await prisma.cZone.findFirst({
    where: { userId: user.id }
  })

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
  let targetCount = Math.max(1, baseCount + extraCount)

  // 4) If we already have layoutData.zones[] (any length), return that directly
  if (
    zone?.layoutData &&
    typeof zone.layoutData === 'object' &&
    Array.isArray(zone.layoutData.zones) &&
    zone.layoutData.zones.every(
      (z) =>
        typeof z.background === 'string' &&
        Array.isArray(z.toons)
    )
  ) {
    const existingCount = zone.layoutData.zones.length
    targetCount = Math.max(targetCount, existingCount)
    const padded = [...zone.layoutData.zones]
    while (padded.length < targetCount) {
      padded.push({ background: '', toons: [] })
    }
    return {
      ctoons,
      backgrounds,
      zones: padded
    }
  }

  // 5) Otherwise, wrap the old single‐zone into a multi-zone array.
  //    If `zone.layoutData` was an array of items, put that array into the first sub‐zone.

  const singleLayout = Array.isArray(zone?.layoutData)
    ? zone.layoutData
    : []
  const singleBg = typeof zone?.background === 'string'
    ? zone.background
    : ''

  const emptyZones = [{ background: singleBg, toons: singleLayout }]
  while (emptyZones.length < targetCount) {
    emptyZones.push({ background: '', toons: [] })
  }

  return {
    ctoons,
    backgrounds,
    zones: emptyZones
  }
})
