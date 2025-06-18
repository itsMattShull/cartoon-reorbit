import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Admin check via /api/auth/me
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  // 2. Fetch all claimed codes with code string, claiming user, and timestamp
  const claims = await prisma.claim.findMany({
    orderBy: { claimedAt: 'desc' },
    include: {
      code: { select: { code: true } },
      user: { select: { id: true, username: true } }
    }
  })

  // 3. Shape for frontend
  return claims.map(c => ({
    id: c.id,
    code: c.code.code,
    user: c.user,
    claimedAt: c.claimedAt
  }))
})