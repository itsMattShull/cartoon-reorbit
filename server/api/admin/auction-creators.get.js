// /server/api/admin/auctions/creators.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // Auth (reuse middleware user if set)
  let me = event.context.user
  if (!me) {
    const cookie = getRequestHeader(event, 'cookie') || ''
    try {
      me = await $fetch('/api/auth/me', { headers: { cookie } })
    } catch {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  // Get distinct creators that have at least one auction
  const rows = await prisma.auction.findMany({
    distinct: ['creatorId'],
    where: { creatorId: { not: null } },
    select: {
      creator: { select: { id: true, username: true } }
    }
  })

  // Flatten, drop nulls, sort by username
  const creators = rows
    .map(r => r.creator)
    .filter(Boolean)
  creators.sort((a, b) => (a.username || '').localeCompare(b.username || ''))

  return creators
})
