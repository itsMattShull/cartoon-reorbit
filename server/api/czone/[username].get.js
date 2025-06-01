// server/api/czone/[username].get.js

import { PrismaClient } from '@prisma/client'
import { defineEventHandler, createError } from 'h3'

const prisma = new PrismaClient()

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
      isFirstEdition: uc.isFirstEdition
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
    }
  }

  // 5) Choose the first cZone (if any) to return; otherwise prepare an empty default
  let chosenZone
  if (user.cZones.length > 0) {
    chosenZone = user.cZones[0]
  } else {
    // No existing cZone → return a blank 3-zone structure
    chosenZone = {
      id: null,
      layoutData: {
        zones: [
          { background: '', toons: [] },
          { background: '', toons: [] },
          { background: '', toons: [] }
        ]
      },
      isPublic: true
    }
  }

  // 6) Enrich each sub-zone’s toons with metadata
  const enrichedZones = (chosenZone.layoutData.zones || []).map((subZone) => {
    const enrichedToons = (subZone.toons || []).map((item) => {
      const meta = ctoonMeta[item.id] || {}
      return {
        ...item,
        mintNumber: meta.mintNumber ?? null,
        quantity: meta.quantity ?? null,
        series: meta.series ?? null,
        rarity: meta.rarity ?? null,
        isFirstEdition: meta.isFirstEdition ?? null
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
    cZone: {
      id: chosenZone.id,
      zones: enrichedZones,
      isPublic: chosenZone.isPublic ?? true
    }
  }
})
