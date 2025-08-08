// server/api/admin/ctoos.get.js


import { defineEventHandler, getRequestHeader, createError } from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Admin check via your auth endpoint
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

  // 2. Fetch all cToons with id and name
  const ctoons = await prisma.ctoon.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      assetPath: true
    }
  })

  return ctoons
})
