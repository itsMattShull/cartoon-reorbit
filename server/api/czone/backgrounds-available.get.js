// server/api/backgrounds-available.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const owned = await db.userBackground.findMany({
    where: { userId: me.id },
    select: { backgroundId: true }
  })
  const ownedIds = owned.map(o => o.backgroundId)

  const bgs = await db.background.findMany({
    where: {
      OR: [ { visibility: 'PUBLIC' }, { id: { in: ownedIds } } ]
    },
    orderBy: { createdAt: 'desc' }
  })
  return bgs
})