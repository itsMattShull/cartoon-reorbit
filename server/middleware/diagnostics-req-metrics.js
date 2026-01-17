import { requestMetricsEnabled, recordRequestMetrics } from '../diagnostics/metrics.mjs'

export default defineEventHandler((event) => {
  if (!requestMetricsEnabled) return
  const res = event?.node?.res
  const req = event?.node?.req
  if (!res || !req) return

  res.on('finish', () => {
    recordRequestMetrics(req.url, res.statusCode)
  })
})
