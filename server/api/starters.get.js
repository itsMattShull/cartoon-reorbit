// server/api/starters.get.js
import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async () => {
  const sets = await prisma.starterSet.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          position: true,
          ctoon: {
            select: {
              id: true,
              name: true,
              rarity: true,
              assetPath: true
            }
          }
        }
      }
    }
  })
  return sets
})
