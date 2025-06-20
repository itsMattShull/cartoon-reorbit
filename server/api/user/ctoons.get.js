// server/api/user/ctoons.get.js
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  /* 1. Auth check ------------------------------------------------ */
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  /* 2. Parse query params --------------------------------------- */
  const { exclude, isGtoon } = getQuery(event)

  // a) optional “exclude” list of UserCtoon IDs
  let excludeIds = []
  if (exclude) {
    try { excludeIds = JSON.parse(exclude) } catch (_) { /* ignore */ }
  }

  // b) optional “isGtoon=true” → boolean
  const filterGtoon = String(isGtoon).toLowerCase() === 'true'

  /* 3. Query UserCtoons ----------------------------------------- */
  const rows = await prisma.userCtoon.findMany({
    where: {
      userId,
      isTradeable: true,
      id:          { notIn: excludeIds },
      ...(filterGtoon && {
        ctoon: {  // relation filter
          is: { isGtoon: true }
        }
      })
    },
    select: {
      id:            true,
      mintNumber:    true,
      isFirstEdition:true,
      ctoon: {
        select: {
          assetPath:   true,
          name:        true,
          isGtoon:     true,
          set:         true,
          series:      true,
          rarity:      true,
          releaseDate: true,
          cost:      true,
          power:     true,
          abilityKey:true,
          abilityData:true
        }
      }
    }
  })

  /* 4. Shape response ------------------------------------------- */
  return rows.map(uc => ({
    id:            uc.id,
    assetPath:     uc.ctoon.assetPath,
    name:          uc.ctoon.name,
    mintNumber:    uc.mintNumber,
    rarity:        uc.ctoon.rarity,
    isFirstEdition:uc.isFirstEdition,
    set:           uc.ctoon.set,
    series:        uc.ctoon.series,
    releaseDate:   uc.ctoon.releaseDate,
    isGtoon:       uc.ctoon.isGtoon,
    cost:          uc.ctoon.cost,
    power:         uc.ctoon.power,
    abilityData:   uc.ctoon.abilityData,
    abilityKey:    uc.ctoon.abilityKey,
  }))
})
