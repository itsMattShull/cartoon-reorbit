import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { username } = event.context.params

  // 1. Find the current user
  const currentUser = await prisma.user.findUnique({
    where: { username },
    select: { createdAt: true }
  })

  if (!currentUser) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    })
  }

  // 2. Find the previous user based on createdAt with at least 1 cToon in layoutData
  const previousRows = await prisma.$queryRaw`
    SELECT u."username"
    FROM "User" u
    JOIN "CZone" cz ON cz."userId" = u."id"
    WHERE u."createdAt" < ${currentUser.createdAt}
      AND u."username" IS NOT NULL
      AND u."username" <> ''
      AND COALESCE(
        (
          SELECT SUM(COALESCE(jsonb_array_length(z->'toons'), 0))
          FROM jsonb_array_elements(cz."layoutData"->'zones') AS z
        ),
        0
      ) >= 1
    ORDER BY u."createdAt" DESC
    LIMIT 1;
  `

  if (!previousRows || previousRows.length === 0) {
    // Get the most recently created user with at least 1 cToon (wrap around)
    const latestRows = await prisma.$queryRaw`
      SELECT u."username"
      FROM "User" u
      JOIN "CZone" cz ON cz."userId" = u."id"
      WHERE u."username" IS NOT NULL
        AND u."username" <> ''
        AND COALESCE(
          (
            SELECT SUM(COALESCE(jsonb_array_length(z->'toons'), 0))
            FROM jsonb_array_elements(cz."layoutData"->'zones') AS z
          ),
          0
        ) >= 1
      ORDER BY u."createdAt" DESC
      LIMIT 1;
    `

    if (!latestRows || latestRows.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'No users in database'
      })
    }

    return { username: latestRows[0].username }
  }

  // 3. Return the username
  return { username: previousRows[0].username }
})
