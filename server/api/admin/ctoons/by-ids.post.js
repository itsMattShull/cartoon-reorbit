import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

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

  const ctoons = await db.ctoon.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, rarity: true, assetPath: true }
  })

  return ctoons
})
