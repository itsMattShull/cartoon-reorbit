import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

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

  return prisma.userTradeListItem.findMany({
    where: { userId, userCtoon: { userId, burnedAt: null } },
    select: { userCtoonId: true }
  })
})
