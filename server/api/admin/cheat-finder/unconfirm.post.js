import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { isValidCheatFinderType, groupsCacheKey } from '@/server/utils/cheatFinderKey'

export default defineEventHandler(async (event) => {
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

  const body = await readBody(event)
  const type = String(body?.type || '')
  const groupKey = String(body?.groupKey || '')
  if (!isValidCheatFinderType(type)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid type' })
  }
  if (!groupKey) {
    throw createError({ statusCode: 400, statusMessage: 'Missing groupKey' })
  }

  await prisma.cheatFinderConfirmation.deleteMany({
    where: { type, groupKey }
  })

  try { await redis.del(groupsCacheKey(type)) } catch {}

  return { success: true }
})
