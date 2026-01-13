import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const requesterId = event.context.userId
  if (!requesterId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const { q = '', limit = '20' } = getQuery(event)
  const query = String(q || '').trim()
  if (query.length < 3) return []

  const take = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50)
  const like = `%${query}%`

  const rows = await prisma.$queryRaw`
    SELECT
      uc."id" AS "userCtoonId",
      uc."mintNumber" AS "mintNumber",
      u."username" AS "ownerUsername",
      u."avatar" AS "ownerAvatar",
      c."id" AS "ctoonId",
      c."name" AS "name",
      c."assetPath" AS "assetPath"
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
    ORDER BY uc."mintNumber" ASC NULLS LAST, c."name" ASC, u."username" ASC
    LIMIT ${take}
  `

  return rows.map(row => ({
    userCtoonId: row.userCtoonId,
    ctoonId: row.ctoonId,
    name: row.name,
    assetPath: row.assetPath,
    mintNumber: row.mintNumber,
    ownerUsername: row.ownerUsername,
    ownerAvatar: row.ownerAvatar
  }))
})
