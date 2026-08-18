import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { resolveUserCtoonId } from '@/server/utils/userCtoonId'
import { isFavoritedCopy } from '@/server/utils/favoriteRules'

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

  const owned = await prisma.userCtoon.findFirst({
    where: { id: userCtoonId, userId, burnedAt: null },
    select: { id: true, userId: true, favoritedByUserId: true }
  })
  if (!owned) {
    throw createError({ statusCode: 403, statusMessage: 'UserCtoon not owned by user' })
  }
  // The other half of the mutual exclusion enforced by POST /api/favorites,
  // which drops the trade-list row when a copy is favorited. Refusing here too
  // means neither order of operations can leave both set.
  if (isFavoritedCopy(owned)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This cToon is one of your favorites. Remove the favorite before listing it as tradable.'
    })
  }

  const item = await prisma.userTradeListItem.upsert({
    where: { userId_userCtoonId: { userId, userCtoonId } },
    create: { userId, userCtoonId },
    update: {}
  })

  return { success: true, item }
})
