// server/utils/economyFreshness.js
// Keeps the Economy page's CtoonPriceDaily aggregate fresh without depending
// on a separately-deployed cron worker (server/cron/sync-guild-members.js).
// Every Economy API route calls ensureEconomyDataFresh() before reading
// CtoonPriceDaily; on a cache miss it runs the same incremental aggregation
// the cron job runs, gated by a short Redis TTL so it doesn't re-run on
// every request, and by runEconomyAggregate's own Postgres advisory lock so
// concurrent requests don't race each other.
import { redis } from './redis'
import { runEconomyAggregate } from '../cron/economy-aggregate.js'

const FRESHNESS_KEY = 'economy:aggregate:fresh'
const FRESHNESS_TTL = 300 // 5 minutes — bounds how stale prices can get if nothing else is aggregating

export async function ensureEconomyDataFresh() {
  try {
    if (await redis.get(FRESHNESS_KEY)) return
  } catch {
    return // redis unavailable — don't block the request on it
  }

  try {
    await runEconomyAggregate()
  } catch (err) {
    console.error('[economy] on-demand aggregate run failed:', err?.message || err)
  }

  try {
    await redis.set(FRESHNESS_KEY, '1', 'EX', FRESHNESS_TTL)
  } catch {}
}
