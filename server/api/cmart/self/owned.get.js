import { defineEventHandler, createError, setHeader } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const rows = await prisma.userCtoon.groupBy({
    by: ['ctoonId'],
    where: {
      userId,
      burnedAt: null
    }
  })

  setHeader(event, 'Cache-Control', 'no-store')

  return {
    ownedCtoonIds: rows.map((row) => row.ctoonId)
  }
})
