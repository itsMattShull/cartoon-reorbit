import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // Auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // Fetch all offers where I'm the recipient
  const offers = await prisma.tradeOffer.findMany({
    where: { recipientId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      initiator: { select: { id: true, username: true } },
      recipient: { select: { id: true, username: true } },
      ctoons: {
        include: {
          userCtoon: {
            include: { ctoon: true }
          }
        }
      }
    }
  })
  return offers
})
