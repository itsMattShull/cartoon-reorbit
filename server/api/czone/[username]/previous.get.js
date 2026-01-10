import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { username } = event.context.params || {}
  if (!username) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing username'
    })
  }

  const rows = await prisma.$queryRaw`
    SELECT u."username", u."createdAt"
    FROM "User" u
    JOIN "CZone" cz ON cz."userId" = u."id"
    WHERE u."username" IS NOT NULL
      AND u."username" <> ''
      AND COALESCE(
        (
          CASE
            WHEN jsonb_typeof(cz."layoutData"->'zones') = 'array' THEN (
              SELECT SUM(COALESCE(jsonb_array_length(z->'toons'), 0))
              FROM jsonb_array_elements(cz."layoutData"->'zones') AS z
            )
            WHEN jsonb_typeof(cz."layoutData") = 'array' THEN jsonb_array_length(cz."layoutData")
            ELSE 0
          END
        ),
        0
      ) >= 1
    ORDER BY u."createdAt" ASC, u."username" ASC;
  `

  if (!rows || rows.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No users found'
    })
  }

  const idx = rows.findIndex(r => r.username === username)
  const prevIndex = idx === -1 ? rows.length - 1 : (idx - 1 + rows.length) % rows.length
  return { username: rows[prevIndex].username }
})
