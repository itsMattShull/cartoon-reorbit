import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async () => {
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
})
