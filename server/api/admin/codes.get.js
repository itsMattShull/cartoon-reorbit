// server/api/admin/codes.get.js
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Admin check
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
  const limit = Math.min(Math.max(parseInt(query.limit || '50', 10), 1), 200)
  const skip = (page - 1) * limit

  // 2) Fetch codes with fixed, pooled, and background rewards
  const [total, codes] = await Promise.all([
    prisma.claimCode.count({ where: { showInFrontend: true } }),
    prisma.claimCode.findMany({
      where: { showInFrontend: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        code: true,
        maxClaims: true,
        expiresAt: true,
        prerequisites: {
          select: {
            ctoonId: true,
            ctoon: { select: { id: true, name: true } }
          }
        },
        rewards: {
          select: {
            points: true,
            // fixed cToons (legacy)
            ctoons: {
              select: {
                ctoonId: true,
                quantity: true,
                ctoon: { select: { id: true, name: true } }
              }
            },
            // pooled cToons (new)
            pooledUniqueCount: true,
            poolCtoons: {
              select: {
                ctoonId: true,
                weight: true,
                ctoon: { select: { id: true, name: true } }
              }
            },
            // background rewards
            backgrounds: {
              select: {
                backgroundId: true,
                background: { select: { id: true, label: true, imagePath: true } }
              }
            }
          }
        }
      }
    })
  ])

  return { items: codes, total, page, limit }
})
