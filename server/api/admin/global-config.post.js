// server/api/admin/global-config.post.js
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Authenticate & authorize
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  // 2) Read + validate payload
  const body = await readBody(event)
  const { dailyPointLimit } = body
  if (dailyPointLimit == null || typeof dailyPointLimit !== 'number') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing or invalid "dailyPointLimit", must be a number'
    })
  }

  // 3) Upsert the singleton global config row
  try {
    const result = await db.globalGameConfig.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        dailyPointLimit
      },
      update: {
        dailyPointLimit
      }
    })
    return result
  } catch (err) {
    console.error('Error upserting GlobalGameConfig:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save global settings' })
  }
})
