// server/api/random.get.js
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async () => {
  // Pick one qualifying username at random directly in SQL for performance.
  // "Qualifying" = has a CZone with at least 1 cToon placed.
  const rows = await prisma.$queryRaw`
    SELECT u."username"
    FROM "CZone" cz
    JOIN "User" u ON u."id" = cz."userId"
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
    ORDER BY random()
    LIMIT 1;
  `

  if (!rows || rows.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No qualifying users found (need at least 1 cToon placed).'
    })
  }

  return { username: rows[0].username }
})
