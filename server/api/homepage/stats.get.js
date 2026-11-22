import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { cachedJson } from '@/server/utils/cache'

// Site-wide vanity totals on the public landing page — identical for every visitor and crawler,
// and one of them counts the whole UserCtoon table — so compute them at most every 5 minutes.
export default defineEventHandler(() => cachedJson('homepage:stats', 300, loadStats))

async function loadStats() {
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const [
    users,
    activeUsers,
    ctoonsSold,
    activeAuctions,
    tradesAllTime
  ] = await Promise.all([
    db.user.count({ where: { active: true, banned: false } }),
    db.user.count({
      where: {
        active: true,
        banned: false,
        OR: [
          { lastActivity: { gte: since } },
          { lastLogin: { gte: since } }
        ]
      }
    }),
    db.userCtoon.count(),
    db.auction.count({ where: { status: 'ACTIVE' } }),
    db.tradeOffer.count({ where: { status: 'ACCEPTED' } })
  ])

  return { users, activeUsers, ctoonsSold, activeAuctions, tradesAllTime }
}
