import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const submissions = await prisma.submittedCtoon.findMany({
    where: { status: 'PENDING' },
    orderBy: { submittedAt: 'asc' },
    include: {
      user: {
        select: { id: true, username: true, discordTag: true, discordAvatar: true }
      }
    }
  })

  return submissions
})
