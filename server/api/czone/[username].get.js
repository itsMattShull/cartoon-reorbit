// server/api/czone/[username].get.js

import { defineEventHandler, createError } from 'h3'

import { prisma } from '@/server/prisma'

function normalizeZones(layoutData, background, targetCount) {
  let zones = []
  if (layoutData && typeof layoutData === 'object' && Array.isArray(layoutData.zones)) {
    zones = layoutData.zones.map((subZone) => ({
      background: typeof subZone?.background === 'string' ? subZone.background : '',
      toons: Array.isArray(subZone?.toons) ? subZone.toons : []
    }))
  } else if (Array.isArray(layoutData)) {
    zones = [{
      background: typeof background === 'string' ? background : '',
      toons: layoutData
    }]
  } else {
    zones = [{
      background: typeof background === 'string' ? background : '',
      toons: []
    }]
  }

  while (zones.length < targetCount) {
    zones.push({ background: '', toons: [] })
  }
  return zones
}

export default defineEventHandler(async (event) => {
  const { username } = event.context.params

  // 1) Fetch user by username, including their cZones
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      cZones: true
    }
  })

  // 2) If no such user, return 404
  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    })
  }

  const config = await prisma.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { czoneCount: true }
  })
  const baseCount = Number(config?.czoneCount ?? 3)
  const extraCount = Math.max(0, Number(user.additionalCzones ?? 0))
  let targetCount = Math.max(1, baseCount + extraCount)

  // 3) Build a set of all userCtoon IDs the user still owns
  const allCZoneToonIds = new Set()
  for (const zone of user.cZones) {
    if (
      zone.layoutData &&
      typeof zone.layoutData === 'object' &&
      Array.isArray(zone.layoutData.zones)
    ) {
      for (const subZone of zone.layoutData.zones) {
        for (const item of subZone.toons || []) {
          if (item.id) {
            allCZoneToonIds.add(item.id)
          }
        }
      }
    } else if (Array.isArray(zone.layoutData)) {
      for (const item of zone.layoutData) {
        if (item?.id) {
          allCZoneToonIds.add(item.id)
        }
      }
    }
  }

  // Fetch only those userCtoons still owned
  const ownedUserCtoons = await prisma.userCtoon.findMany({
    where: {
      id: { in: Array.from(allCZoneToonIds) },
      userId: user.id
    },
    include: { ctoon: true }
  })
  const ownedSet = new Set(ownedUserCtoons.map((uc) => uc.id))

  // Helper: Enrich a single userCtoon ID with metadata
  const ctoonMeta = {}
  for (const uc of ownedUserCtoons) {
    ctoonMeta[uc.id] = {
      mintNumber: uc.mintNumber,
      quantity: uc.ctoon.quantity,
      series: uc.ctoon.series,
      rarity: uc.ctoon.rarity,
      isFirstEdition: uc.isFirstEdition,
      ctoonId: uc.ctoon.id,
      isGtoon: uc.ctoon.isGtoon,
      cost: uc.ctoon.cost,
      power: uc.ctoon.power
    }
  }

  // 4) For each cZone, remove any orphaned toons and
  //    update the DB if we filtered out anything
  for (const z of user.cZones) {
    if (
      z.layoutData &&
      typeof z.layoutData === 'object' &&
      Array.isArray(z.layoutData.zones)
    ) {
      let dirty = false
      const cleanedZones = z.layoutData.zones.map((subZone) => {
        const kept = (subZone.toons || []).filter((item) =>
          ownedSet.has(item.id)
        )
        if (kept.length !== (subZone.toons || []).length) {
          dirty = true
        }
        return {
          background: subZone.background || '',
          toons: kept
        }
      })

      if (dirty) {
        // Persist the cleaned layoutData back to the database
        await prisma.cZone.update({
          where: { id: z.id },
          data: {
            layoutData: { zones: cleanedZones }
          }
        })
        // Also update the in-memory copy
        z.layoutData = { zones: cleanedZones }
      }
    } else if (Array.isArray(z.layoutData)) {
      const kept = z.layoutData.filter((item) => ownedSet.has(item?.id))
      if (kept.length !== z.layoutData.length) {
        await prisma.cZone.update({
          where: { id: z.id },
          data: { layoutData: kept }
        })
        z.layoutData = kept
      }
    }
  }

  // 5) Choose the first cZone (if any) to return; otherwise prepare an empty default
  let chosenZone
  if (user.cZones.length > 0) {
    chosenZone = user.cZones[0]
  } else {
    // No existing cZone → return a blank zone structure
    chosenZone = {
      id: null,
      layoutData: {
        zones: [{ background: '', toons: [] }]
      },
      isPublic: true
    }
  }

  const normalizedZones = normalizeZones(
    chosenZone.layoutData,
    chosenZone.background,
    targetCount
  )

  // 6) Enrich each sub-zone’s toons with metadata
  const enrichedZones = normalizedZones.map((subZone) => {
    const enrichedToons = (subZone.toons || []).map((item) => {
      const meta = ctoonMeta[item.id] || {}
      return {
        ...item,
        mintNumber: meta.mintNumber ?? null,
        quantity: meta.quantity ?? null,
        series: meta.series ?? null,
        rarity: meta.rarity ?? null,
        isFirstEdition: meta.isFirstEdition ?? null,
        ctoonId: meta.ctoonId ?? null,
        isGtoon: meta.isGtoon ?? null,
        cost: meta.cost ?? null,
        power: meta.power ?? null
      }
    })
    return {
      background: subZone.background || '',
      toons: enrichedToons
    }
  })

  // 7) Return the payload containing owner info and the 3-zone array
  return {
    ownerId: user.id,
    avatar: user.avatar,
    ownerName: user.username,
    isBooster: user.isBooster,
    cZone: {
      id: chosenZone.id,
      zones: enrichedZones,
      isPublic: chosenZone.isPublic ?? true
    }
  }
})
