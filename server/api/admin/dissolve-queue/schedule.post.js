// server/api/admin/dissolve-queue/schedule.post.js
// Reschedule all (or unscheduled) dissolve-queue entries from the management page.
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { scheduleDissolveAuctionLaunch, cancelDissolveAuctionLaunch } from '@/server/utils/queues'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event) || {}
  const {
    startAtUtc,
    cadenceDays,
    pokemonPerCadence,
    crazyRarePerCadence,
    otherPerCadence,
    reschedule = false,
  } = body

  if (!startAtUtc) throw createError({ statusCode: 400, statusMessage: 'startAtUtc required' })
  const startMs = new Date(startAtUtc).getTime()
  if (isNaN(startMs)) throw createError({ statusCode: 400, statusMessage: 'Invalid startAtUtc' })
  if (!cadenceDays || Number(cadenceDays) < 1) throw createError({ statusCode: 400, statusMessage: 'cadenceDays must be >= 1' })

  const perCategory = {
    POKEMON:    Number(pokemonPerCadence)   || 0,
    CRAZY_RARE: Number(crazyRarePerCadence) || 0,
    OTHER:      Number(otherPerCadence)     || 0,
  }

  // Fetch entries to schedule
  const entries = await prisma.dissolveAuctionQueue.findMany({
    where: reschedule ? {} : { scheduledFor: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, category: true, scheduledFor: true }
  })

  if (!entries.length) return { scheduled: 0 }

  // If rescheduling, cancel existing BullMQ jobs first
  if (reschedule) {
    for (const e of entries) {
      if (e.scheduledFor) {
        await cancelDissolveAuctionLaunch(e.id)
      }
    }
  }

  // Group by category
  const grouped = { POKEMON: [], CRAZY_RARE: [], OTHER: [] }
  for (const e of entries) grouped[e.category]?.push(e.id)

  let scheduled = 0

  for (const [cat, ids] of Object.entries(grouped)) {
    const countPerCadence = perCategory[cat]
    if (!countPerCadence || !ids.length) continue
    const intervalMs = (Number(cadenceDays) * 24 * 3600 * 1000) / countPerCadence

    for (let i = 0; i < ids.length; i++) {
      const scheduledFor = new Date(startMs + i * intervalMs)
      await prisma.dissolveAuctionQueue.update({
        where: { id: ids[i] },
        data:  { scheduledFor }
      })
      await scheduleDissolveAuctionLaunch(ids[i], scheduledFor)
      scheduled++
    }
  }

  return { scheduled }
})
