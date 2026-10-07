import { requestMetricsEnabled, recordRequestMetrics } from '../diagnostics/metrics.mjs'

// A request that grows the process by this much (RSS or JS heap) while it was in flight is
// logged. Concurrent requests share the same process, so this is attribution by correlation
// (a busy process can blame an innocent request), but a route that shows up repeatedly with
// large deltas is the one to look at.
const HEAVY_DELTA_BYTES = 100 * 1024 * 1024
const toMb = (n) => Math.round(n / 1048576)

export default defineEventHandler((event) => {
  if (!requestMetricsEnabled) return
  const res = event?.node?.res
  const req = event?.node?.req
  if (!res || !req) return

  const startedAt = Date.now()
  const startRss = process.memoryUsage.rss()
  const startHeap = process.memoryUsage().heapUsed

  // 'close' fires for completed and aborted requests alike (unlike 'finish').
  res.once('close', () => {
    recordRequestMetrics(req.url, res.statusCode)

    const rssDelta = process.memoryUsage.rss() - startRss
    const heapDelta = process.memoryUsage().heapUsed - startHeap
    if (rssDelta >= HEAVY_DELTA_BYTES || heapDelta >= HEAVY_DELTA_BYTES) {
      // Path only: the query string can carry one-time codes/tokens (e.g. the Discord callback).
      const path = (req.url || '').split('?')[0]
      console.warn(
        `[diag] memory-heavy request ${req.method} ${path} status=${res.statusCode} ` +
        `${Date.now() - startedAt}ms rss+${toMb(rssDelta)}MB heap+${toMb(heapDelta)}MB`
      )
    }
  })
})
