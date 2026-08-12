// server/api/admin/auction-only/[id]/start.post.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAuctionOnlyError } from '@/server/utils/auctionOnlyErrorLog'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { activateAuctionOnlyRow, AUCTION_ONLY_ROW_INCLUDE } from '@/server/utils/auctionOnlyActivate'

export default defineEventHandler(async (event) => {
  try {
    return await handleStart(event)
  } catch (err) {
    const statusCode = err?.statusCode || 500
    if (statusCode >= 500) {
      await logAuctionOnlyError('activation', err, event.context.params?.id || null)
    }
    throw err
  }
})

async function handleStart(event) {
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

  const row = await prisma.auctionOnly.findUnique({
    where: { id },
    include: AUCTION_ONLY_ROW_INCLUDE
  })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Auction not found' })
  if (row.isStarted) throw createError({ statusCode: 400, statusMessage: 'This listing has already gone live.' })

  let result
  try {
    result = await activateAuctionOnlyRow(row)
  } catch (err) {
    await logAuctionOnlyError('activation', err, id)
    throw createError({ statusCode: 500, statusMessage: `Failed to start auction: ${err?.message || String(err)}` })
  }

  // Refused on purpose: the copy is no longer the official account's to sell, so
  // starting it would auction someone else's cToon. Not a concurrency error, and
  // retrying will not help — say so plainly.
  if (result?.refused) {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot start this listing: ${result.reason}. Remove the listing, or re-acquire the cToon before starting it.`
    })
  }

  if (!result) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This listing changed concurrently (it already went live, or an active auction already exists for this cToon). Refresh and try again.'
    })
  }

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'AuctionOnly',
    key: 'manualStart',
    prevValue: { isStarted: false, startsAt: row.startsAt },
    newValue: { isStarted: true, auctionId: result.auctionId },
    targetUserId: null,
    targetUsername: null
  })

  return { ok: true, auctionId: result.auctionId }
}
