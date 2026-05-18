import { defineEventHandler, createError, getRequestHeader } from 'h3'
import { prisma } from '@/server/prisma'
import { resolveUserCtoonId } from '@/server/utils/userCtoonId'

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

  const rawUserCtoonId = event.context.params?.userCtoonId
  if (!rawUserCtoonId) throw createError({ statusCode: 400, statusMessage: 'Missing userCtoonId' })
  const userCtoonId = await resolveUserCtoonId(rawUserCtoonId)
  if (!userCtoonId) throw createError({ statusCode: 400, statusMessage: 'Invalid cToon reference' })

  await prisma.userTradeListItem.deleteMany({
    where: { userId, userCtoonId }
  })

  return { success: true }
})
