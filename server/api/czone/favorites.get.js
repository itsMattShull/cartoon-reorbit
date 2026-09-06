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

  const rows = await prisma.favoriteCzone.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      favoritedUser: { select: { username: true, avatar: true } }
    }
  })

  return rows
    .filter(r => r.favoritedUser?.username)
    .map(r => ({ username: r.favoritedUser.username, avatar: r.favoritedUser.avatar }))
})
