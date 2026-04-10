// server/api/admin/dissolve-queue/[id].delete.js
// Cancel (and optionally delete) a single dissolve-queue entry.
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { cancelDissolveAuctionLaunch } from '@/server/utils/queues'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const entry = await prisma.dissolveAuctionQueue.findUnique({ where: { id } })
  if (!entry) throw createError({ statusCode: 404, statusMessage: 'Queue entry not found' })

  // Cancel the BullMQ delayed job if one exists
  await cancelDissolveAuctionLaunch(id)

  // Clear scheduledFor so the entry stays in the queue but is unscheduled
  await prisma.dissolveAuctionQueue.update({
    where: { id },
    data:  { scheduledFor: null }
  })

  return { ok: true }
})
