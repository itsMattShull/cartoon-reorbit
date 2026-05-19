import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { clearSearchesCache } from '@/server/api/czone/[username]/searches.get'

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

  const { id } = event.context.params
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing search id' })

  await db.cZoneSearch.delete({ where: { id } })

  try { await redis.del(`czone:search-meta:${id}`) } catch {}
  clearSearchesCache()

  return { ok: true }
})
