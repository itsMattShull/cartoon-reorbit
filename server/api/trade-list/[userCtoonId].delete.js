import { defineEventHandler, createError, getRequestHeader } from 'h3'
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

  await prisma.userTradeListItem.deleteMany({
    where: { userId, userCtoonId }
  })

  return { success: true }
})
