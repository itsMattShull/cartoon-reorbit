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

  const username = event.context.params?.username
  if (!username) throw createError({ statusCode: 400, statusMessage: 'Missing username' })

  const target = await prisma.user.findUnique({ where: { username }, select: { id: true } })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (target.id === userId) throw createError({ statusCode: 400, statusMessage: "You can't favorite your own cZone" })

  await prisma.favoriteCzone.upsert({
    where: { userId_favoritedUserId: { userId, favoritedUserId: target.id } },
    create: { userId, favoritedUserId: target.id },
    update: {}
  })

  return { success: true }
})
