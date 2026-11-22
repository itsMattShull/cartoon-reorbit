// Read-only, zero-new-tracking data for the "leaderboard plaque" MyOrbit room widget
// (MyOrbitRoom.showLeaderboard) — a room flagged this way polls this endpoint for a couple of
// "top player this week" stats pulled straight from rows that already exist, same cheap-and-
// cosmetic spirit as the Raid Den's active-raid.get.js. Cached for CACHE_TTL_SEC: this is a
// "this week" stat, not a live one, so there is no reason for several players with a leaderboard
// room open to each re-run both queries on every poll.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { cachedJson } from '@/server/utils/cache'
import { isPackAuction } from '@/server/utils/auctionItem'

const CACHE_TTL_SEC = 60
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

async function loadTopAuctionSale () {
  const weekAgo = new Date(Date.now() - WEEK_MS)
  // highestBid is the final/winning price once status is CLOSED — see Auction.highestBid's own
  // schema comment; there is no separate soldAt/finalPrice column.
  const sale = await db.auction.findFirst({
    where: { status: 'CLOSED', winnerId: { not: null }, endAt: { gte: weekAgo } },
    orderBy: { highestBid: 'desc' },
    select: {
      kind: true,
      highestBid: true,
      winner: { select: { username: true } },
      userCtoon: { select: { ctoon: { select: { name: true } } } },
      userPack: { select: { pack: { select: { name: true } } } }
    }
  })
  if (!sale) return null
  // Never read sale.userCtoon.<field> unguarded - a pack auction has none (see
  // server/utils/auctionItem.js's own header comment; tests/auctionItemAccess.test.js enforces
  // this across server/).
  const itemName = isPackAuction(sale)
    ? (sale.userPack?.pack?.name ?? 'a pack')
    : (sale.userCtoon?.ctoon?.name ?? 'a cToon')
  return { itemName, amount: sale.highestBid, username: sale.winner?.username ?? null }
}

async function loadTopRaidDamage () {
  const weekAgo = new Date(Date.now() - WEEK_MS)
  // One synthetic CMoonEnemyBattle row per raid participant already carries their own damageDealt
  // (see that model's own schema comment) - summed per user across every raid this week, never a
  // new tracking table.
  const top = await db.cMoonEnemyBattle.groupBy({
    by: ['userId'],
    where: { raidId: { not: null }, startedAt: { gte: weekAgo } },
    _sum: { damageDealt: true },
    orderBy: { _sum: { damageDealt: 'desc' } },
    take: 1
  })
  const row = top[0]
  if (!row || !row._sum.damageDealt) return null
  const user = await db.user.findUnique({ where: { id: row.userId }, select: { username: true } })
  if (!user) return null
  return { username: user.username, amount: row._sum.damageDealt }
}

export default defineEventHandler(async (event) => {
  if (!event.context.userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const [topAuctionSale, topRaidDamage] = await cachedJson('myorbit:leaderboard', CACHE_TTL_SEC, async () => {
    return Promise.all([loadTopAuctionSale(), loadTopRaidDamage()])
  })

  return { topAuctionSale, topRaidDamage }
})
