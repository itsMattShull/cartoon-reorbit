// GET /api/admin/touch-trades
// "Track Touch Trades" report: same-mint cToons that bounced back and forth
// between the same two players at least twice (an initial trade, then a
// trade back) within a bounded date window. Surfaces full trade data plus
// each side's IP/device (captured going forward, inferred from login history
// for older trades) — sensitive enough that this is gated behind the
// super-admin tier rather than plain isAdmin (see server/utils/adminAuth.js).
//
// Query params:
//   from, to        ISO dates. Defaults to the last 90 days; clamped to a
//                   180-day window server-side regardless of what's passed
//                   (see clampDateRange) so a wide range can't turn this into
//                   an unbounded scan.
//   username        optional — only groups involving this user (substring
//                   match, resolved to user ids before it ever reaches SQL).
//   showDismissed   '1' to include pairs an admin already reviewed and
//                   dismissed (TouchTradeConfirmation) — hidden by default.
//   page, limit     pagination over the group list (1..50, default 20).
import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { requireSuperAdmin } from '@/server/utils/adminAuth'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import {
  findTouchTradeGroups,
  fetchGroupLegs,
  clampDateRange
} from '@/server/utils/touchTrades'

const GROUPS_CACHE_TTL = 120
const MAX_USERNAME_MATCHES = 50

function ymd(d) { return d.toISOString().slice(0, 10) }
const groupsCacheKey = (from, to) => `admin:touch-trades:groups:${ymd(from)}:${ymd(to)}`

export default defineEventHandler(async (event) => {
  const me = await requireSuperAdmin(event)

  setHeader(event, 'Cache-Control', 'no-store')

  const q = getQuery(event)
  const { from, to } = clampDateRange(q.from, q.to)
  const page = Math.max(1, parseInt(q.page) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(q.limit) || 20))
  const showDismissed = q.showDismissed === '1' || q.showDismissed === 'true'
  const usernameFilter = q.username?.trim()

  // Full candidate group list for this date window — cheap (just identity
  // columns) and shared across every page/filter combination of the same
  // window, so it's cached once rather than per (page, username, ...) tuple.
  const cacheKey = groupsCacheKey(from, to)
  let groups
  try {
    const cached = await redis.get(cacheKey)
    if (cached) groups = JSON.parse(cached).map(g => g)
  } catch {}

  if (!groups) {
    groups = await findTouchTradeGroups(prisma, { from, to })
    try { await redis.set(cacheKey, JSON.stringify(groups), 'EX', GROUPS_CACHE_TTL) } catch {}
  }

  if (usernameFilter) {
    const matches = await prisma.user.findMany({
      where: { username: { contains: usernameFilter, mode: 'insensitive' } },
      select: { id: true },
      take: MAX_USERNAME_MATCHES
    })
    const matchIds = new Set(matches.map(m => m.id))
    groups = groups.filter(g => matchIds.has(g.userLo) || matchIds.has(g.userHi))
  }

  if (!showDismissed && groups.length) {
    const dismissed = await prisma.touchTradeConfirmation.findMany({
      where: { groupKey: { in: groups.map(g => g.groupKey) } },
      select: { groupKey: true }
    })
    const dismissedSet = new Set(dismissed.map(d => d.groupKey))
    groups = groups.filter(g => !dismissedSet.has(g.groupKey))
  }

  const total = groups.length
  const paged = groups.slice((page - 1) * limit, page * limit)

  const [legsByGroup, ctoonRows, userRows] = await Promise.all([
    fetchGroupLegs(prisma, { groups: paged, from, to }),
    paged.length
      ? prisma.ctoon.findMany({
          where: { id: { in: Array.from(new Set(paged.map(g => g.ctoonId))) } },
          select: { id: true, name: true, assetPath: true, rarity: true }
        })
      : [],
    paged.length
      ? prisma.user.findMany({
          where: { id: { in: Array.from(new Set(paged.flatMap(g => [g.userLo, g.userHi]))) } },
          select: { id: true, username: true }
        })
      : []
  ])
  const ctoonById = new Map(ctoonRows.map(c => [c.id, c]))
  const userById = new Map(userRows.map(u => [u.id, u]))

  const resultGroups = paged.map(g => {
    const legs = legsByGroup.get(g.groupKey) || []
    return {
      groupKey: g.groupKey,
      ctoon: ctoonById.get(g.ctoonId) || { id: g.ctoonId, name: null, assetPath: null, rarity: null },
      mintNumber: g.mintNumber,
      userA: userById.get(g.userLo) || { id: g.userLo, username: null },
      userB: userById.get(g.userHi) || { id: g.userHi, username: null },
      tradeCount: legs.length,
      firstAt: legs[0]?.createdAt ?? null,
      lastAt: legs[legs.length - 1]?.createdAt ?? null,
      legs
    }
  })

  // Best-effort audit trail of who viewed this sensitive report and with
  // what scope — there is otherwise no record that an admin looked at other
  // users' IP/device data (see the security review this was written from).
  logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:TouchTrades',
    key: 'view',
    newValue: { from: ymd(from), to: ymd(to), username: usernameFilter || null, page, resultCount: resultGroups.length }
  }).catch(() => {})

  return { groups: resultGroups, total, page, limit, from: from.toISOString(), to: to.toISOString() }
})
