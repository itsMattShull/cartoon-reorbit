import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { username } = event.context.params

  // 1. Find current user
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

  // 2. Find next user by createdAt with at least 1 cToon in layoutData
  const nextRows = await prisma.$queryRaw`
    SELECT u."username"
    FROM "User" u
    JOIN "CZone" cz ON cz."userId" = u."id"
    WHERE u."createdAt" > ${currentUser.createdAt}
      AND u."username" IS NOT NULL
      AND u."username" <> ''
      AND COALESCE(
        (
          SELECT SUM(COALESCE(jsonb_array_length(z->'toons'), 0))
          FROM jsonb_array_elements(cz."layoutData"->'zones') AS z
        ),
        0
      ) >= 1
    ORDER BY u."createdAt" ASC
    LIMIT 1;
  `

  if (nextRows && nextRows.length > 0) {
    return { username: nextRows[0].username }
  }

  // 3. Wrap around to earliest user with at least 1 cToon if no next one
  const firstRows = await prisma.$queryRaw`
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
    ORDER BY u."createdAt" ASC
    LIMIT 1;
  `

  if (!firstRows || firstRows.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No users found'
    })
  }

  return { username: firstRows[0].username }
})
