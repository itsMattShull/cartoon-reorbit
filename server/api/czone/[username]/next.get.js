import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'

export const NAV_CACHE_KEY = 'czone:nav:usernames'
const NAV_CACHE_TTL = 3600 // 1 hour

export async function getCZoneNavUsernames() {
  try {
    const cached = await redis.get(NAV_CACHE_KEY)
    if (cached) return JSON.parse(cached)
  } catch {}

  const rows = await prisma.$queryRaw`
    SELECT u."username"
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
  const usernames = rows.map(r => r.username)
  try {
    await redis.setex(NAV_CACHE_KEY, NAV_CACHE_TTL, JSON.stringify(usernames))
  } catch {}
  return usernames
}

export default defineEventHandler(async (event) => {
  const { username } = event.context.params || {}
  if (!username) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing username'
    })
  }

  const usernames = await getCZoneNavUsernames()

  if (!usernames.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No users found'
    })
  }

  const idx = usernames.indexOf(username)
  const nextIndex = idx === -1 ? 0 : (idx + 1) % usernames.length
  return { username: usernames[nextIndex] }
})
