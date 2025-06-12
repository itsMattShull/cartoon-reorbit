// server/api/auctions.post.js

import { PrismaClient } from '@prisma/client'
import {
  defineEventHandler,
  getRequestHeader,
  readBody,
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

  // 2. Parse & validate body
  const { userCtoonId, initialBet, durationDays } = await readBody(event)
  if (!userCtoonId || !initialBet || !durationDays) {
    throw createError({ statusCode: 422, statusMessage: 'Missing required fields' })
  }

  // 3. Ownership check
  const ownerCheck = await prisma.userCtoon.findUnique({
    where: { id: userCtoonId },
    select: { userId: true }
  })
  if (!ownerCheck || ownerCheck.userId !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'You do not own this cToon' })
  }

  // 4. Existing auction check
  const existing = await prisma.auction.findFirst({
    where: {
      userCtoonId,
      status: 'ACTIVE'          // only forbid if there's still an active one
    }
  })
  if (existing) {
    throw createError({ statusCode: 400, statusMessage: 'This cToon already has an active auction' })
  }

  // 5. Create auction with UTC endAt
  const now    = Date.now()
  const later  = now + durationDays * 24 * 60 * 60 * 1000
  // toISOString() always gives UTC
  const endAtUtc = new Date(later).toISOString()

  const auction = await prisma.auction.create({
    data: {
      userCtoonId,
      initialBet,
      duration:    durationDays,
      endAt:       endAtUtc
    }
  })

  // 6. Disable tradeability
  await prisma.userCtoon.update({
    where: { id: userCtoonId },
    data: { isTradeable: false }
  })

  return { success: true, auction }
})
