import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Admin check via /api/auth/me
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

  const query = getQuery(event)
  const page = Math.max(parseInt(query.page || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(query.limit || '100', 10), 1), 200)
  const skip = (page - 1) * limit
  const q = typeof query.q === 'string' ? query.q.trim() : ''

  const where = q
    ? {
        OR: [
          { code: { code: { contains: q, mode: 'insensitive' } } },
          { user: { username: { contains: q, mode: 'insensitive' } } },
          {
            code: {
              rewards: {
                some: {
                  ctoons: {
                    some: { ctoon: { name: { contains: q, mode: 'insensitive' } } }
                  }
                }
              }
            }
          },
          {
            code: {
              rewards: {
                some: {
                  poolCtoons: {
                    some: { ctoon: { name: { contains: q, mode: 'insensitive' } } }
                  }
                }
              }
            }
          },
          {
            code: {
              rewards: {
                some: {
                  packs: {
                    some: { pack: { name: { contains: q, mode: 'insensitive' } } }
                  }
                }
              }
            }
          },
          {
            code: {
              prerequisites: {
                some: { ctoon: { name: { contains: q, mode: 'insensitive' } } }
              }
            }
          }
        ]
      }
    : {}

  // 2. Fetch claimed codes with code string, claiming user, and timestamp
  const [total, claims] = await Promise.all([
    prisma.claim.count({ where }),
    prisma.claim.findMany({
      where,
      orderBy: { claimedAt: 'desc' },
      skip,
      take: limit,
      include: {
        code: { select: { code: true } },
        user: { select: { id: true, username: true } }
      }
    })
  ])

  // 3. What each claim ACTUALLY granted. Editing a code later changes what future claimants get, so the current
  // reward definition says nothing about earlier claims; the packs themselves (UserPack.sourceRef = claim id) do.
  const grants = claims.length
    ? await prisma.userPack.groupBy({
        by: ['sourceRef'],
        where: { source: 'CODE', sourceRef: { in: claims.map(c => c.id) } },
        _count: { _all: true }
      })
    : []
  const packsByClaim = new Map(grants.map(g => [g.sourceRef, g._count._all]))

  // 4. Shape for frontend
  const items = claims.map(c => ({
    id: c.id,
    code: c.code.code,
    user: c.user,
    claimedAt: c.claimedAt,
    packsGranted: packsByClaim.get(c.id) || 0
  }))

  return { items, total, page, limit }
})
