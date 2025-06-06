// server/api/collections/all.get.js

import { PrismaClient } from '@prisma/client'
import {
  defineEventHandler,
  getRequestHeader,
  createError,
  getQuery
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
  const userId = me && me.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Read page query (default to 1)
  const { page: pageRaw } = getQuery(event) || {}
  const page = parseInt(pageRaw) || 1
  const take = 25
  const skip = (page - 1) * take

  try {
    // 3. Fetch one page of all Ctoons
    const allCtoons = await prisma.ctoon.findMany({
      skip,
      take,
      orderBy: { releaseDate: 'desc' }
    })

    // 4. Fetch the user's owned ctoonIds
    const ownedRows = await prisma.userCtoon.findMany({
      where: { userId },
      select: { ctoonId: true }
    })
    const ownedSet = new Set(ownedRows.map(row => row.ctoonId))

    // 5. Map each Ctoon → include isOwned
    return allCtoons.map((c) => ({
      id:          c.id,
      name:        c.name,
      set:         c.set,
      series:      c.series,
      rarity:      c.rarity,
      assetPath:   c.assetPath,
      price:       c.price,
      releaseDate: c.releaseDate,
      quantity:    c.quantity,
      isOwned:     ownedSet.has(c.id)
    }))
  } catch (err) {
    console.error('Error fetching all collections (paginated):', err)
    return []
  }
})
