// server/api/admin/codes.get.js


import { defineEventHandler, getRequestHeader, createError } from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Admin check via your /api/auth/me endpoint
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

  // 2. Fetch all codes with maxClaims, expiration, and full reward definitions
  const codes = await prisma.claimCode.findMany({
    where: { showInFrontend: true },
    orderBy: { createdAt: 'desc' },
    select: {
      code: true,
      maxClaims: true,
      expiresAt: true,
      rewards: {
        select: {
          points: true,
          ctoons: {
            select: {
              ctoonId: true,
              quantity: true
            }
          }
        }
      }
    }
  })

  return codes
})
