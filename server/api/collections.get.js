// server/api/collections.get.js

import { PrismaClient } from '@prisma/client'
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'
const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  // 1. Authenticate user
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  try {
    // 1) fetch the full Ctoon catalog
    const allCtoons = await prisma.ctoon.findMany()

    // 2) fetch only the user’s UserCtoon rows (to know which ctoonIds they own)
    const ownedRows = await prisma.userCtoon.findMany({
      where: { userId },
      select: { ctoonId: true }
    })
    const ownedSet = new Set(ownedRows.map(row => row.ctoonId))

    // 3) build the response so each ctoon has its `owners` array include a boolean “isOwned”
    return allCtoons.map(c => ({
      id:          c.id,
      name:        c.name,
      set:         c.set,
      series:      c.series,
      rarity:      c.rarity,
      assetPath:   c.assetPath,
      price:       c.price,
      releaseDate: c.releaseDate,
      quantity:    c.quantity,
      // we no longer have a full `owners` list — just mark true/false on each Ctoon
      isOwned:     ownedSet.has(c.id)
    }))
  } catch (err) {
    console.error('Error fetching collections:', err)
    return []
  }
})
