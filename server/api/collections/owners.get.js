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
  if (!me?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2) Validate query
  const { cToonId } = getQuery(event)
  if (!cToonId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing cToonId query parameter' })
  }

  // 3) Fetch all owners of this cToon, sorted by mintNumber
  try {
    const owners = await prisma.userCtoon.findMany({
      where: { ctoonId: cToonId },
      select: {
        userId:     true,
        mintNumber: true,
        user: {
          select: { username: true }
        }
      },
      orderBy: { mintNumber: 'asc' }
    })

    // 4) Flatten and return
    return owners.map(o => ({
      userId:     o.userId,
      username:   o.user.username,
      mintNumber: o.mintNumber
    }))
  } catch (err) {
    console.error('Error fetching owners:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch owners' })
  }
})
