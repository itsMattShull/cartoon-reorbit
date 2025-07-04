// server/api/admin/rarity-turnover-rate.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // — Admin check (unchanged)
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

  // — Parse & normalize timeframe → days
  const { timeframe = '1m' } = getQuery(event)
  let days
  switch (timeframe) {
    case '1m': days = 30;  break
    case '3m': days = 90;  break
    case '6m': days = 180; break
    case '1y': days = 365; break
    default:   days = 30
  }

  // — Compute turnover rate per rarity over the last N days
  const raw = await prisma.$queryRawUnsafe(`
WITH filtered AS (
  SELECT
    toc."userCtoonId",
    c."rarity"
  FROM "TradeOfferCtoon" toc
  JOIN "TradeOffer" toff
    ON toc."tradeOfferId" = toff.id
  JOIN "UserCtoon" uc
    ON toc."userCtoonId" = uc.id
  JOIN "Ctoon" c
    ON uc."ctoonId" = c.id
  WHERE
    toc.role = 'REQUESTED'
    AND toff."createdAt" >= now() - INTERVAL '${days} days'
),
total_per_rarity AS (
  SELECT
    c2."rarity",
    COUNT(uc2.id)::float AS total_supply
  FROM "UserCtoon" uc2
  JOIN "Ctoon" c2
    ON uc2."ctoonId" = c2.id
  WHERE uc2."createdAt" >= now() - INTERVAL '${days} days'
  GROUP BY c2."rarity"
)
SELECT
  f.rarity,
  -- cast to numeric before rounding so ROUND(numeric, int) is valid
  ROUND(
    (
      COUNT(DISTINCT f."userCtoonId")
      / t.total_supply
    )::numeric
  , 4) AS turnover_rate
FROM filtered f
JOIN total_per_rarity t
  ON t.rarity = f.rarity
GROUP BY f.rarity, t.total_supply
ORDER BY
  CASE f.rarity
    WHEN 'Common'     THEN 1
    WHEN 'Uncommon'   THEN 2
    WHEN 'Rare'       THEN 3
    WHEN 'Very Rare'  THEN 4
    WHEN 'Crazy Rare' THEN 5
  END;
  `)

  return {
    timeframe,
    days,
    data: raw.map(r => ({
      rarity:       r.rarity,
      turnoverRate: Number(r.turnover_rate)
    }))
  }
})
