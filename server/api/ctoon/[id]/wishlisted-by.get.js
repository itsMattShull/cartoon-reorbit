// server/api/ctoon/[id]/wishlisted-by.get.js
//
// Lists who actually has a given cToon on their wishlist — the people behind the "On X
// wishlists" tile on the cToon info card (server/api/ctoon/modal.get.js's own wishlistCount).
// Same shape as the sibling server/api/ctoon/[id]/displayed-in.get.js (that feature's "list on
// click" endpoint behind its own precomputed count), but WishlistItem is a plain relational
// table — no CZone.layoutData JSON scan needed, a straight indexed query suffices (see
// WishlistItem.@@index([ctoonId])'s own schema comment).
//
// Returns usernames only, never a WishlistItem id or offeredPoints — a viewer has no business
// knowing another player's offered-points figure before that player chooses to show it
// themselves (e.g. via their own public wishlist page), and nothing here needs it: the
// "initiate a trade" action on the client is just a plain link into the trade room with that
// username pre-selected, not an instant accept of their wishlist's own offer.
import { defineEventHandler, createError, getRequestHeader } from 'h3'
import { prisma } from '@/server/prisma'

// Same cap/overflow shape as displayed-in.get.js — a cToon thousands of players have wishlisted
// would otherwise return a huge list for what's meant to be a quick glance.
const MAX_RESULTS = 200

export default defineEventHandler(async (event) => {
  const { id } = event.context.params || {}
  if (!id) {
    throw createError({ statusCode: 422, statusMessage: 'Missing cToon ID' })
  }

  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const ctoon = await prisma.ctoon.findUnique({ where: { id }, select: { id: true } })
  if (!ctoon) {
    throw createError({ statusCode: 404, statusMessage: 'cToon not found' })
  }

  const rows = await prisma.wishlistItem.findMany({
    where: { ctoonId: ctoon.id },
    orderBy: { user: { username: 'asc' } },
    take: MAX_RESULTS + 1,
    select: { user: { select: { username: true } } },
  })

  const hasMore = rows.length > MAX_RESULTS
  const items = (hasMore ? rows.slice(0, MAX_RESULTS) : rows).map(r => ({ username: r.user.username }))

  return { items, hasMore }
})
