// server/api/collections.get.js

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
  const take = 200
  const skip = (page - 1) * take

  try {
    // 3. Fetch one page of UserCtoons for this user, including nested Ctoon
    const userCtoons = await prisma.userCtoon.findMany({
      where: { userId },
      include: { ctoon: true },
      skip,
      take,
      orderBy: { createdAt: 'asc' }
    })

    // 4. Map each UserCtoon → only the fields the client expects
    return userCtoons.map((uc) => ({
      id:              uc.id,
      name:            uc.ctoon.name,
      set:             uc.ctoon.set,
      series:          uc.ctoon.series,
      type:            uc.ctoon.type,
      rarity:          uc.ctoon.rarity,
      assetPath:       uc.ctoon.assetPath,
      releaseDate:     uc.ctoon.releaseDate,
      price:           uc.ctoon.price,
      initialQuantity: uc.ctoon.initialQuantity,
      quantity:        uc.ctoon.quantity,
      characters:      uc.ctoon.characters,
      mintNumber:      uc.mintNumber,
      isFirstEdition:  uc.isFirstEdition
    }))
  } catch (err) {
    console.error('Error fetching user collections (paginated):', err)
    return []
  }
})
