// server/api/user/certificate.get.js
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'

// Decorative border on the certificate holds this many cToon thumbnails —
// capped deliberately so a heavy collector's request stays a single cheap
// DB-level random sample instead of pulling their whole collection to shore
// down client-side.
const BORDER_IMAGE_COUNT = 18

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, createdAt: true }
  })
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // DB-level random sample (Postgres `ORDER BY random() LIMIT n`) rather than
  // fetching every owned row and sampling in JS — stays a single cheap query
  // regardless of collection size. Prisma's tagged-template $queryRaw
  // parameterizes ${userId} automatically, so this isn't string-built SQL.
  const rows = await prisma.$queryRaw`
    SELECT c."assetPath" AS "assetPath", c."name" AS "name"
    FROM "UserCtoon" uc
    JOIN "Ctoon" c ON c.id = uc."ctoonId"
    WHERE uc."userId" = ${userId} AND uc."burnedAt" IS NULL
    ORDER BY random()
    LIMIT ${BORDER_IMAGE_COUNT}
  `

  return {
    username: user.username,
    memberSince: user.createdAt,
    borderImages: rows.map((r) => ({ assetPath: r.assetPath, name: r.name }))
  }
})
