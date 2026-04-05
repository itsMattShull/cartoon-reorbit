// server/api/admin/ctoons/bulk-details.post.js
// Returns full editable fields for a list of cToon IDs (used by bulk edit modal)
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
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

  const body = await readBody(event)
  const ids = Array.isArray(body?.ids)
    ? body.ids.map(id => String(id || '').trim()).filter(Boolean)
    : []
  if (!ids.length) return []

  const ctoons = await prisma.ctoon.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      assetPath: true,
      rarity: true,
      set: true,
      series: true,
      inCmart: true,
      codeOnly: true,
      price: true,
      perUserLimit: true,
      quantity: true,
      initialQuantity: true,
      releaseDate: true,
      mintLimitType: true,
      mintEndDate: true,
      type: true,
    }
  })

  return ctoons
})
