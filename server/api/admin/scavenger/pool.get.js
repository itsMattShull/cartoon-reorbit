// server/api/admin/scavenger/pool.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const rows = await db.scavengerExclusiveCtoon.findMany({
    include: { ctoon: { select: { id: true, name: true, rarity: true, assetPath: true, quantity: true, _count: { select: { owners: true } } } } }
  })

  return rows.map(r => ({
    id: r.id,
    ctoon: {
      id: r.ctoon.id,
      name: r.ctoon.name,
      rarity: r.ctoon.rarity,
      assetPath: r.ctoon.assetPath,
      quantity: r.ctoon.quantity,
      owners: r.ctoon._count.owners
    }
  }))
})

