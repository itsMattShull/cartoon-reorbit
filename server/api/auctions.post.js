
import {
  defineEventHandler,
  getRequestHeader,
  readBody,
  createError
} from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Authenticate
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

  // 2. Parse & validate
  const { userCtoonId, initialBet, durationDays, durationMinutes } = await readBody(event)
  if (
    !userCtoonId ||
    !initialBet ||
    (durationDays === undefined || durationMinutes === undefined)
  ) {
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

  // 4. Active auction check
  const existing = await prisma.auction.findFirst({
    where: { userCtoonId, status: 'ACTIVE' }
  })
  if (existing) {
    throw createError({ statusCode: 400, statusMessage: 'There’s already an active auction for this cToon' })
  }

  // 5. Compute endAt
  const nowMs    = Date.now()
  const daysMs   = durationDays * 24 * 60 * 60 * 1000
  const minsMs   = durationMinutes * 60 * 1000
  const endAtUtc = new Date(nowMs + daysMs + minsMs).toISOString()

  // 6. Create auction
  const auction = await prisma.auction.create({
    data: {
      userCtoonId,
      initialBet,
      duration: durationDays,
      endAt: endAtUtc
    }
  })

  // 7. Disable tradeability
  await prisma.userCtoon.update({
    where: { id: userCtoonId },
    data: { isTradeable: false }
  })

  return { success: true, auction }
})
