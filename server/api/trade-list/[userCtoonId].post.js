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

  const { userCtoonId } = event.context.params || {}
  if (!userCtoonId) throw createError({ statusCode: 400, statusMessage: 'Missing userCtoonId' })

  const owned = await prisma.userCtoon.findFirst({
    where: { id: userCtoonId, userId },
    select: { id: true }
  })
  if (!owned) {
    throw createError({ statusCode: 403, statusMessage: 'UserCtoon not owned by user' })
  }

  const item = await prisma.userTradeListItem.upsert({
    where: { userId_userCtoonId: { userId, userCtoonId } },
    create: { userId, userCtoonId },
    update: {}
  })

  return { success: true, item }
})
