// server/api/admin/auction-only/bulk.delete.js
// Removes every currently-listed "upcoming" AuctionOnly (isStarted=false,
// startsAt in the future) — the exact set shown on the main manage-auctions
// list. None of these have activated yet, so there's never a correlated
// Auction/bids/isTradeable lock to clean up; each deletion still gets its
// own AdminChangeLog entry so the audit trail matches single-item removal.
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAuctionOnlyError } from '@/server/utils/auctionOnlyErrorLog'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  try {
    return await handleBulkRemove(event)
  } catch (err) {
    const statusCode = err?.statusCode || 500
    if (statusCode >= 500) {
      await logAuctionOnlyError('removal', err, null)
    }
    throw err
  }
})

async function handleBulkRemove(event) {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const now = new Date()
  const targets = await prisma.auctionOnly.findMany({
    where: { isStarted: false, startsAt: { gt: now } },
    select: {
      id: true,
      pricePoints: true,
      startsAt: true,
      endsAt: true,
      isFeatured: true,
      userCtoonId: true,
      userCtoon: {
        select: {
          mintNumber: true,
          userId: true,
          user: { select: { username: true } },
          ctoon: { select: { name: true } }
        }
      }
    }
  })

  if (!targets.length) return { ok: true, removed: 0 }

  let removed = 0
  const failures = []

  for (const t of targets) {
    try {
      const del = await prisma.auctionOnly.deleteMany({ where: { id: t.id, isStarted: false } })
      if (del.count !== 1) continue // started concurrently between the read and delete — skip, not a failure

      removed++
      await logAdminChange(prisma, {
        userId: me.id,
        area: 'AuctionOnly',
        key: 'delete',
        prevValue: {
          ctoonName: t.userCtoon?.ctoon?.name || null,
          mintNumber: t.userCtoon?.mintNumber ?? null,
          pricePoints: t.pricePoints,
          startsAt: t.startsAt,
          endsAt: t.endsAt,
          isFeatured: t.isFeatured,
          isStarted: false,
          hadAuction: false,
          removedVia: 'bulk'
        },
        newValue: null,
        targetUserId: t.userCtoon?.userId || null,
        targetUsername: t.userCtoon?.user?.username || null
      })
    } catch (err) {
      failures.push({ id: t.id, ctoonName: t.userCtoon?.ctoon?.name || t.id, error: err?.message || String(err) })
    }
  }

  if (failures.length) {
    throw createError({
      statusCode: 500,
      statusMessage: `Removed ${removed} of ${targets.length}. Failed: ${failures.map(f => `${f.ctoonName} (${f.error})`).join('; ')}`
    })
  }

  return { ok: true, removed }
}
