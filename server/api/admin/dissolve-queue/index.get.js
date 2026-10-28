// server/api/admin/dissolve-queue/index.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { getDissolveScheduleConfig } from '@/server/utils/dissolveSchedule'
import { dissolveStartingBid, isSpecialDissolveRarity } from '@/server/utils/dissolveListing'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  // Saved cadence (so the Reschedule All form shows what's really in effect, not hardcoded
  // defaults) and the special-rarity starting bids that decide which entries are held.
  const config = await getDissolveScheduleConfig()

  const allEntries = await prisma.dissolveAuctionQueue.findMany({
    include: {
      userCtoon: {
        select: {
          id: true,
          mintNumber: true,
          ctoon: { select: { name: true, rarity: true, series: true, set: true, assetPath: true } }
        }
      }
    },
    orderBy: [{ priority: 'desc' }, { scheduledFor: 'asc' }, { createdAt: 'asc' }]
  })

  const byCategory = {
    FEATURED: { total: 0, scheduled: 0, unscheduled: 0, held: 0 },
    OTHER:    { total: 0, scheduled: 0, unscheduled: 0, held: 0 },
  }

  // Held = can't auto-list until a starting bid is set for its rarity (see dissolveListing.js).
  // Counted separately from "unscheduled" so it's clear these need a bid, not an Apply Schedule.
  const startingBidOf = (e) => dissolveStartingBid(e.userCtoon?.ctoon?.rarity, config.startBids)
  let pinnedCount = 0
  const heldByRarity = {}
  for (const e of allEntries) {
    const cat = byCategory[e.category] || byCategory.OTHER
    cat.total++
    if (e.scheduledFor) cat.scheduled++
    else if (startingBidOf(e) === null) {
      cat.held++
      const r = e.userCtoon?.ctoon?.rarity || 'Unknown'
      heldByRarity[r] = (heldByRarity[r] || 0) + 1
    } else cat.unscheduled++
    if (e.pinnedAt) pinnedCount++
  }

  const mapEntry = (e) => ({
    id:             e.id,
    category:       e.category,
    isFeatured:     e.isFeatured,
    priority:       e.priority,
    fromInactive:   e.fromInactive,
    sourceUsername: e.sourceUsername,
    scheduledFor:   e.scheduledFor,
    pinned:         !!e.pinnedAt,
    createdAt:      e.createdAt,
    ctoonName:      e.userCtoon?.ctoon?.name ?? null,
    ctoonImage:     e.userCtoon?.ctoon?.assetPath ?? null,
    rarity:         e.userCtoon?.ctoon?.rarity ?? null,
    series:         e.userCtoon?.ctoon?.series ?? null,
    set:            e.userCtoon?.ctoon?.set ?? null,
    mintNumber:     e.userCtoon?.mintNumber ?? null,
    startingBid:    startingBidOf(e),
    held:           startingBidOf(e) === null,
    specialRarity:  isSpecialDissolveRarity(e.userCtoon?.ctoon?.rarity),
  })

  // Next 20 scheduled entries
  const upcoming = allEntries
    .filter(e => e.scheduledFor)
    .slice(0, 20)
    .map(mapEntry)

  // All entries for search/pagination on the frontend
  const entries = allEntries.map(mapEntry)

  return {
    total: allEntries.length,
    byCategory,
    heldByRarity,
    config,
    pinnedCount,
    upcoming,
    entries,
  }
})
