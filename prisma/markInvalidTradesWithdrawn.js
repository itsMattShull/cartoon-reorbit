// prisma/markInvalidTradesWithdrawn.js
// Marks PENDING TradeOffers as WITHDRAWN when the cToons in the trade
// are no longer owned by the expected party:
//   - OFFERED ctoons must still be owned by the initiator
//   - REQUESTED ctoons must still be owned by the recipient
import { prisma } from '../server/prisma.js'

const COMMIT = process.argv.includes('--commit')

async function main() {
  console.log(`[markInvalidTradesWithdrawn] start. commit=${COMMIT}`)

  const pendingTrades = await prisma.tradeOffer.findMany({
    where: { status: 'PENDING' },
    select: {
      id: true,
      initiatorId: true,
      recipientId: true,
      ctoons: {
        select: {
          role: true,
          userCtoon: {
            select: { id: true, userId: true },
          },
        },
      },
    },
  })

  console.log(`[markInvalidTradesWithdrawn] found ${pendingTrades.length} pending trade(s)`)

  const invalidIds = []

  for (const trade of pendingTrades) {
    let isInvalid = false

    for (const tc of trade.ctoons) {
      if (tc.role === 'OFFERED' && tc.userCtoon.userId !== trade.initiatorId) {
        console.log(
          `  trade ${trade.id}: OFFERED userCtoon ${tc.userCtoon.id} no longer owned by initiator ${trade.initiatorId} (owned by ${tc.userCtoon.userId})`
        )
        isInvalid = true
        break
      }

      if (tc.role === 'REQUESTED' && tc.userCtoon.userId !== trade.recipientId) {
        console.log(
          `  trade ${trade.id}: REQUESTED userCtoon ${tc.userCtoon.id} no longer owned by recipient ${trade.recipientId} (owned by ${tc.userCtoon.userId})`
        )
        isInvalid = true
        break
      }
    }

    if (isInvalid) {
      invalidIds.push(trade.id)
    }
  }

  console.log(`[markInvalidTradesWithdrawn] ${invalidIds.length} trade(s) to withdraw`)

  if (!COMMIT) {
    console.log('[markInvalidTradesWithdrawn] dry-run complete. Use --commit to apply.')
    return
  }

  if (invalidIds.length > 0) {
    const result = await prisma.tradeOffer.updateMany({
      where: { id: { in: invalidIds } },
      data: { status: 'WITHDRAWN' },
    })
    console.log(`[markInvalidTradesWithdrawn] marked ${result.count} trade(s) as WITHDRAWN.`)
  }

  console.log('[markInvalidTradesWithdrawn] done.')
}

main()
  .catch((err) => {
    console.error('[markInvalidTradesWithdrawn] fatal:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
