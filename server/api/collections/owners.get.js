// server/api/collections/owners.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Authenticate
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // 2) Validate query
  const { cToonId } = getQuery(event)
  if (!cToonId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing cToonId query parameter' })
  }

  try {
    // 3) Fetch owners and holiday flag
    const [owners, holidayRow] = await Promise.all([
      prisma.userCtoon.findMany({
        where: { ctoonId: String(cToonId) },
        select: {
          userId: true,
          mintNumber: true,
          user: { select: { username: true } }
        },
        orderBy: { mintNumber: 'asc' }
      }),
      prisma.holidayEventItem.findFirst({
        where: { ctoonId: String(cToonId) },
        select: { id: true }
      })
    ])
    const isHolidayItem = !!holidayRow

    // 4) Flatten and return
    return owners.map(o => ({
      userId:     o.userId,
      username:   o.user.username,
      mintNumber: o.mintNumber,
      isHolidayItem
    }))
  } catch (err) {
    console.error('Error fetching owners:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch owners' })
  }
})
