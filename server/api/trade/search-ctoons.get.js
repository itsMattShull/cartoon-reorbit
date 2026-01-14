import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const requesterId = event.context.userId
  if (!requesterId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const { q = '', limit = '50', ctoonId } = getQuery(event)
  const requestedCtoonId = String(ctoonId || '').trim()

  if (requestedCtoonId) {
    if (!/^[0-9a-fA-F-]{36}$/.test(requestedCtoonId)) return []

    const rows = await prisma.userCtoon.findMany({
      where: {
        isTradeable: true,
        userId: { not: requesterId },
        ctoonId: requestedCtoonId
      },
      orderBy: [
        { mintNumber: 'asc' },
        { user: { username: 'asc' } }
      ],
      select: {
        id: true,
        mintNumber: true,
        user: { select: { username: true, avatar: true } },
        ctoon: { select: { id: true, name: true, assetPath: true } }
      }
    })

    return rows.map(row => ({
      userCtoonId: row.id,
      ctoonId: row.ctoon.id,
      name: row.ctoon.name,
      assetPath: row.ctoon.assetPath,
      mintNumber: row.mintNumber,
      ownerUsername: row.user.username,
      ownerAvatar: row.user.avatar
    }))
  }

  const query = String(q || '').trim()
  if (query.length < 3) return []

  const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100)
  const like = `%${query}%`

  const rows = await prisma.$queryRaw`
    SELECT
      c."id" AS "ctoonId",
      c."name" AS "name",
      c."assetPath" AS "assetPath",
      MAX(uc."mintNumber") AS "highestMint"
    FROM "UserCtoon" uc
    JOIN "Ctoon" c ON c."id" = uc."ctoonId"
    JOIN "User" u ON u."id" = uc."userId"
    WHERE uc."isTradeable" = true
      AND u."id" <> ${requesterId}
      AND (
        c."name" ILIKE ${like}
        OR EXISTS (
          SELECT 1 FROM unnest(c."characters") ch WHERE ch ILIKE ${like}
        )
      )
    GROUP BY c."id"
    ORDER BY c."name" ASC
    LIMIT ${take}
  `

  return rows.map(row => ({
    ctoonId: row.ctoonId,
    name: row.name,
    assetPath: row.assetPath,
    highestMint: row.highestMint ?? 0
  }))
})
