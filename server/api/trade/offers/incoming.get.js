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
      initiator: { select: { id: true, username: true, avatar: true } },
      recipient: { select: { id: true, username: true, avatar: true } },
      ctoons: {
        include: {
          userCtoon: {
            include: { ctoon: true }
          }
        }
      },
      // Sealed packs in the offer. Rows are per physical pack; the page groups them by type for display.
      packs: {
        select: {
          id: true,
          role: true,
          userPackId: true,
          userPack: { select: { packId: true, pack: { select: { id: true, name: true, imagePath: true } } } }
        }
      }
    }
  })
  return offers
})
