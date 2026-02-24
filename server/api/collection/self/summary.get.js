import { defineEventHandler, createError, setHeader } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const [totalCount, uniqueRows] = await Promise.all([
    prisma.userCtoon.count({
      where: {
        userId,
        burnedAt: null
      }
    }),
    prisma.userCtoon.groupBy({
      by: ['ctoonId'],
      where: {
        userId,
        burnedAt: null
      }
    })
  ])

  setHeader(event, 'Cache-Control', 'no-store')

  return {
    totalCount,
    uniqueCount: uniqueRows.length
  }
})
