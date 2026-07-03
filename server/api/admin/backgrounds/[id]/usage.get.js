import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
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

  const id = event.context.params?.id
  const bg = await db.background.findUnique({ where: { id } })
  if (!bg) throw createError({ statusCode: 404, statusMessage: 'Background not found' })

  const [
    userCount,
    rewardBackgroundCount,
    achievementRewardCount,
    czoneRows,
    searchPrizeRows
  ] = await Promise.all([
    db.userBackground.count({ where: { backgroundId: id } }),
    db.rewardBackground.count({ where: { backgroundId: id } }),
    db.achievementRewardBackground.count({ where: { backgroundId: id } }),
    db.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM "CZone" cz
      WHERE cz."background" = ${bg.imagePath}
        OR (
          jsonb_typeof(cz."layoutData"->'zones') = 'array'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(cz."layoutData"->'zones') AS z
            WHERE z->>'background' = ${bg.imagePath}
          )
        )
    `,
    db.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM "CZoneSearchPrize"
      WHERE ${bg.filename} = ANY("conditionBackgrounds")
    `
  ])

  return {
    userCount,
    rewardBackgroundCount,
    achievementRewardCount,
    czoneCount: Number(czoneRows?.[0]?.count ?? 0),
    searchPrizeCount: Number(searchPrizeRows?.[0]?.count ?? 0)
  }
})
