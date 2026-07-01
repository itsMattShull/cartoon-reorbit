import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { encodeUserCtoonId } from '@/server/utils/userCtoonId'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  await prisma.userTradeListItem.deleteMany({
    where: {
      userId,
      OR: [
        { userCtoon: { userId: { not: userId } } },
        { userCtoon: { burnedAt: { not: null } } }
      ]
    }
  })

  const items = await prisma.userTradeListItem.findMany({
    where: { userId, userCtoon: { userId, burnedAt: null } },
    select: { userCtoon: { select: { id: true, userId: true, ctoonId: true, mintNumber: true } } }
  })
  return items.map(item => ({
    id: item.userCtoon.id,
    userCtoonId: encodeUserCtoonId(item.userCtoon.userId, item.userCtoon.ctoonId, item.userCtoon.mintNumber)
  }))
})
