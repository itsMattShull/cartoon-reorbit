import { requestMetricsEnabled, recordRequestMetrics, recordPerfMetrics } from '../diagnostics/metrics.mjs'

export default defineEventHandler((event) => {
  const res = event?.node?.res
  const req = event?.node?.req
  if (!res || !req) return

  const startMs = Date.now()

  res.on('finish', () => {
    const durationMs = Date.now() - startMs
    const heapUsedBytes = process.memoryUsage?.().heapUsed ?? null

    if (requestMetricsEnabled) {
      recordRequestMetrics(req.url, res.statusCode)
    }

    recordPerfMetrics({
      url: req.url,
      statusCode: res.statusCode,
      durationMs,
      heapUsedBytes
    })
  })
})
