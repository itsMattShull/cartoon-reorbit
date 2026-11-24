import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { computeDailyTaskStatus } from '@/server/utils/dailyTaskStatus'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  return computeDailyTaskStatus(db, userId)
})
