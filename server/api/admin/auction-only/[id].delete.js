// server/api/admin/auction-only/[id].delete.js
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
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const existing = await prisma.auctionOnly.findUnique({
    where: { id },
    select: { id: true, startsAt: true, isStarted: true }
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Auction not found' })
  if (existing.isStarted || existing.startsAt <= new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'Auction already started' })
  }

  await prisma.auctionOnly.delete({ where: { id } })
  return { ok: true }
})
