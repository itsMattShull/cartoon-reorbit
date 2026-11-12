// Source-level guarantees for the two Economy Index exclusions (high-mint cToons,
// house-account insta-bid auctions with no real bidder). server/cron/economy-aggregate.js
// imports server/prisma.js, which needs a live Postgres connection to do anything useful —
// there's none reachable in this sandbox — and server/api/economy/inflation.get.js imports
// the `@/server/prisma`/`@/server/utils/redis` Nuxt aliases, which bare `node --test` can't
// resolve at all. So, same as tests/ogGtoonsPackRewardWiring.test.js, this reads the files as
// plain text and asserts against the raw source instead of exercising the SQL against a DB.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const aggregate = read('server/cron/economy-aggregate.js')
const inflation = read('server/api/economy/inflation.get.js')

test('aggregateAuctions reuses the cached, shared getSystemUserIds() helper rather than its own house-account lookup', () => {
  assert.match(aggregate, /import \{ getSystemUserIds \} from '\.\.\/utils\/systemAccounts\.js'/)
  const fn = aggregate.slice(aggregate.indexOf('async function aggregateAuctions'), aggregate.indexOf('async function aggregateTrades'))
  assert.match(fn, /const excludeIds = await getSystemUserIds\(\)/)
})

test('the system-account exclusion mirrors getAuctionReferenceValues\'s own winnerId NOT IN pattern', () => {
  const fn = aggregate.slice(aggregate.indexOf('async function aggregateAuctions'), aggregate.indexOf('async function aggregateTrades'))
  assert.match(fn, /a\."winnerId" NOT IN \(\$\{Prisma\.join\(excludeIds\.length \? excludeIds : \['']\)\}\)/)
})

test('touched days are computed independently of the per-ctoon rows, so a day entirely excluded by the system-account filter still gets its stale CtoonPriceDaily rows cleared', () => {
  const fn = aggregate.slice(aggregate.indexOf('async function aggregateAuctions'), aggregate.indexOf('async function aggregateTrades'))
  assert.match(fn, /const touchedRows = await prisma\.\$queryRaw`[\s\S]*?`/)
  assert.match(fn, /const dates = touchedRows\.map\(r => r\.d\)/)
  assert.match(fn, /if \(!dates\.length\) return \{ days: 0, rows: 0 \}/)
  // The per-ctoon query filters on these same pre-computed `dates`, not a fresh
  // same-query CTE, and `replaceDays` is called with `dates`, not anything derived
  // from the (possibly fully-filtered-out) `rows` result.
  assert.match(fn, /date_trunc\('day', COALESCE\(a\."winnerAt", a\."endAt"\)\) = ANY\(\$\{dates\}::timestamp\[\]\)/)
  assert.match(fn, /await replaceDays\('AUCTION', dates, rows\.map/)
})

test('Prisma is imported for the Prisma.join fragment composition', () => {
  assert.match(aggregate, /import \{ Prisma \} from '@prisma\/client'/)
})

test('the inflation index excludes cToons minted more than 400 times', () => {
  assert.match(inflation, /const HIGH_MINT_EXCLUSION_THRESHOLD = 400/)
  const fn = inflation.slice(inflation.indexOf('async function computeInflation'), inflation.indexOf('export default'))
  assert.match(fn, /JOIN "Ctoon" c ON c\.id = cpd\."ctoonId"/)
  assert.match(fn, /c\."totalMinted" <= \$\{HIGH_MINT_EXCLUSION_THRESHOLD\}/)
})

test('economyFilters.js keeps its own separate, opt-in 500 browse-filter cutoff unchanged', () => {
  const economyFilters = read('server/utils/economyFilters.js')
  assert.match(economyFilters, /export const HIGH_MINT_THRESHOLD = 500/)
})
