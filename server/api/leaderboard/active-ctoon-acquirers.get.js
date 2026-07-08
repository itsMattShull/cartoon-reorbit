// server/api/leaderboard/active-ctoon-acquirers.get.js
import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'
import { mergeViewerRow } from '@/server/utils/leaderboardRank'

const EXCLUDE_USER_ID = '4f0e8b3b-7d0b-466b-99e7-8996c91d7eb3'

const COMBINED_CTE = `
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
`

function rankedTop11() {
  return prisma.$queryRawUnsafe(`
    ${COMBINED_CTE}
    SELECT u."id" AS "userId", u."username", u."avatar", c."count",
           (ROW_NUMBER() OVER (ORDER BY c."count" DESC, u."username" ASC))::int AS rank
    FROM combined c
    JOIN "User" u ON u."id" = c."userId"
    WHERE u."active" = true
      AND COALESCE(u."banned", false) = false
      AND u."id" <> '${EXCLUDE_USER_ID}'
    ORDER BY rank
    LIMIT 11;
  `)
}

function rankedViewer(userId) {
  return prisma.$queryRawUnsafe(`
    ${COMBINED_CTE},
    ranked AS (
      SELECT u."id" AS "userId", u."username", u."avatar", c."count",
             (ROW_NUMBER() OVER (ORDER BY c."count" DESC, u."username" ASC))::int AS rank
      FROM combined c
      JOIN "User" u ON u."id" = c."userId"
      WHERE u."active" = true
        AND COALESCE(u."banned", false) = false
        AND u."id" <> '${EXCLUDE_USER_ID}'
    )
    SELECT * FROM ranked WHERE "userId" = $1;
  `, userId)
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId || null

  const top11 = await rankedTop11()
  let viewerRow = null
  if (userId && !top11.some(r => r.userId === userId)) {
    const res = await rankedViewer(userId)
    viewerRow = res[0] || null
  }

  return mergeViewerRow(top11, viewerRow, userId)
})
