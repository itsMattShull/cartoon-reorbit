// server/cron/economy-aggregate-run.js
// One-off runner for the Economy page aggregation, so the first backfill
// doesn't have to wait for the 4:10am cron.
//
//   npm run economy:aggregate            # incremental (only days with new activity)
//   npm run economy:aggregate -- --full  # reset the cursor and rebuild all history
import 'dotenv/config'
import { prisma } from '../prisma.js'
import { runEconomyAggregate, resetEconomyCursor } from './economy-aggregate.js'

const full = process.argv.includes('--full')

async function main() {
  if (full) {
    console.log('[economy-aggregate] --full: resetting cursor, rebuilding all history')
    await resetEconomyCursor()
  }
  await runEconomyAggregate()

  const [auctionRows, tradeRows] = await Promise.all([
    prisma.ctoonPriceDaily.count({ where: { source: 'AUCTION' } }),
    prisma.ctoonPriceDaily.count({ where: { source: 'TRADE' } })
  ])
  console.log(`[economy-aggregate] CtoonPriceDaily now holds ${auctionRows} auction row(s), ${tradeRows} trade row(s)`)
}

main()
  .catch((err) => {
    console.error('[economy-aggregate] fatal:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
