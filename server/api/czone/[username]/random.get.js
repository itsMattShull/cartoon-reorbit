// server/api/random.get.js
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async () => {
  // Pick one qualifying username at random directly in SQL for performance.
  // "Qualifying" = has a CZone with layoutData.zones[*].toons totaling >= 2.
  const rows = await prisma.$queryRaw`
    SELECT u."username"
    FROM "CZone" cz
    JOIN "User" u ON u."id" = cz."userId"
    WHERE u."username" IS NOT NULL
      AND u."username" <> ''
      AND COALESCE(
        (
          SELECT SUM(COALESCE(jsonb_array_length(z->'toons'), 0))
          FROM jsonb_array_elements(cz."layoutData"->'zones') AS z
        ),
        0
      ) >= 2
    ORDER BY random()
    LIMIT 1;
  `

  if (!rows || rows.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No qualifying users found (need at least 2 cToons placed).'
    })
  }

  return { username: rows[0].username }
})
