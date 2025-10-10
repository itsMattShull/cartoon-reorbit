// server/api/admin/all-ctoons.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
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

  const { skip = '0', take = '50' } = getQuery(event)
  const skipNum = parseInt(skip, 10)
  const takeNum = parseInt(take, 10)

  const ctoons = await prisma.ctoon.findMany({
    orderBy: { createdAt: 'desc' },
    skip: skipNum,
    take: takeNum,
    select: {
      id: true,
      name: true,
      set: true,
      series: true,
      assetPath: true,
      releaseDate: true,
      quantity: true,
      rarity: true,
      inCmart: true,
      totalMinted: true, // ← pull aggregate
    }
  })

  return ctoons.map(c => ({
    ...c,
    highestMint: c.totalMinted ?? 0, // ← use Ctoon.totalMinted
  }))
})
