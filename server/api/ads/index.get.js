import { defineEventHandler, getQuery } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { skip = '0', take = '50' } = getQuery(event)
  const skipNum = Number.parseInt(skip, 10) || 0
  const takeNum = Math.min(Math.max(Number.parseInt(take, 10) || 50, 1), 100)

  const [items, total] = await Promise.all([
    db.adImage.findMany({
      skip: skipNum,
      take: takeNum,
      orderBy: { createdAt: 'desc' },
      select: { id: true, imagePath: true, filename: true, label: true, url: true, createdAt: true }
    }),
    db.adImage.count()
  ])

  return {
    items,
    pagination: {
      skip: skipNum,
      take: takeNum,
      total,
      hasMore: skipNum + takeNum < total
    }
  }
})
