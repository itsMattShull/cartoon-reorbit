// server/api/user/points.get.js

import { PrismaClient } from '@prisma/client'
import { defineEventHandler, getRequestHeader, createError } from 'h3'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  // 1. Authenticate user via existing /api/auth/me
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Fetch or initialize UserPoints
  let record = await prisma.userPoints.findUnique({ where: { userId } })
  if (!record) {
    record = await prisma.userPoints.create({ data: { userId, points: 0 } })
  }

  // 3. Return only the points count
  return { points: record.points }
})
