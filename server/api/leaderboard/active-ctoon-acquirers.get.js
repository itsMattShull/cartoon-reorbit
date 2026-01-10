// server/api/leaderboard/active-ctoon-acquirers.get.js
import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'

const EXCLUDE_USER_ID = '4f0e8b3b-7d0b-466b-99e7-8996c91d7eb3'

export default defineEventHandler(async () => {
  const rows = await prisma.$queryRaw`
    WITH purchases AS (
      SELECT "userId", COUNT(*)::int AS "count"
      FROM "PointsLog"
      WHERE "method" = 'Bought cToon'
        AND "createdAt" >= NOW() - INTERVAL '7 days'
      GROUP BY "userId"
    ),
    trade_recipient AS (
      SELECT t."recipientId" AS "userId", COUNT(tc."id")::int AS "count"
      FROM "TradeOffer" t
      JOIN "TradeOfferCtoon" tc ON tc."tradeOfferId" = t."id"
      WHERE t."status" = 'ACCEPTED'
        AND t."updatedAt" >= NOW() - INTERVAL '7 days'
        AND tc."role" = 'OFFERED'
      GROUP BY t."recipientId"
    ),
    trade_initiator AS (
      SELECT t."initiatorId" AS "userId", COUNT(tc."id")::int AS "count"
      FROM "TradeOffer" t
      JOIN "TradeOfferCtoon" tc ON tc."tradeOfferId" = t."id"
      WHERE t."status" = 'ACCEPTED'
        AND t."updatedAt" >= NOW() - INTERVAL '7 days'
        AND tc."role" = 'REQUESTED'
      GROUP BY t."initiatorId"
    ),
    auctions AS (
      SELECT "winnerId" AS "userId", COUNT(*)::int AS "count"
      FROM "Auction"
      WHERE "winnerId" IS NOT NULL
        AND "winnerAt" >= NOW() - INTERVAL '7 days'
      GROUP BY "winnerId"
    ),
    combined AS (
      SELECT "userId", SUM("count")::int AS "count"
      FROM (
        SELECT * FROM purchases
        UNION ALL
        SELECT * FROM trade_recipient
        UNION ALL
        SELECT * FROM trade_initiator
        UNION ALL
        SELECT * FROM auctions
      ) c
      GROUP BY "userId"
    )
    SELECT u."username", c."count"
    FROM combined c
    JOIN "User" u ON u."id" = c."userId"
    WHERE u."active" = true
      AND COALESCE(u."banned", false) = false
      AND u."id" <> ${EXCLUDE_USER_ID}
    ORDER BY c."count" DESC, u."username" ASC
    LIMIT 10;
  `

  return rows
})
