// server/api/admin/starter-sets.get.js

import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Admin check (reuse your auth endpoint)
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

  // 2) Query flags
  const q = getQuery(event)
  const withItems = q.withItems === '1' || q.withItems === 'true'

  // 3) Fetch starter sets
  const sets = await prisma.starterSet.findMany({
    orderBy: { sortOrder: 'asc' },
    include: withItems
      ? {
          // include full item list (ordered) with minimal cToon fields used in admin UI
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
                  assetPath: true,
                  isGtoon: true
                }
              }
            }
          }
        }
      : {
          // when not requesting items, at least return counts
          _count: { select: { items: true } }
        }
  })

  return sets
})
