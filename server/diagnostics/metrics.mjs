const diagEnabled = process.env.DIAG_ENABLED === '1'

export const requestMetricsEnabled =
  diagEnabled && process.env.DIAG_REQ_METRICS === '1'

export const wsMetricsEnabled =
  diagEnabled && process.env.DIAG_WS_METRICS === '1'

// Performance metrics are always enabled (no env gate needed — low overhead)
export const perfMetricsEnabled = true

const requestState = {
  total: 0,
  byStatus: Object.create(null),
  byRoute: Object.create(null)
}

const wsState = {
  current: 0,
  connects: 0,
  disconnects: 0,
  messageIn: 0,
  messageOut: 0
}

function normalizeRoute(url) {
  if (!url) return '/'
  const queryIndex = url.indexOf('?')
  const path = queryIndex === -1 ? url : url.slice(0, queryIndex)
  const parts = path.split('/').filter(Boolean)
  if (!parts.length) return '/'
  return `/${parts[0]}`
}

// More detailed normalizer for performance metrics — keeps full path but
// replaces numeric IDs and UUIDs with placeholders.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC_RE = /^\d+$/

function normalizePerfRoute(url) {
  if (!url) return '/'
  const queryIndex = url.indexOf('?')
  const path = queryIndex === -1 ? url : url.slice(0, queryIndex)
  const parts = path.split('/').filter(Boolean)
  if (!parts.length) return '/'
  const normalized = parts.map(p =>
    UUID_RE.test(p) ? ':id' : NUMERIC_RE.test(p) ? ':id' : p
  )
  return `/${normalized.join('/')}`
}

// ─── Per-endpoint performance state ─────────────────────────────────────────

const perfState = Object.create(null) // route -> PerfEntry

function ensurePerfEntry(route) {
  if (!perfState[route]) {
    perfState[route] = {
      count: 0,
      errorCount: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      // Running sorted sample for p95 approximation (capped at 1000)
      _durations: [],
      heapUsedSum: 0,
      heapSampleCount: 0
    }
  }
  return perfState[route]
}

export function recordPerfMetrics({ url, statusCode, durationMs, heapUsedBytes }) {
  const route = normalizePerfRoute(url)
  const entry = ensurePerfEntry(route)
  entry.count += 1
  if (statusCode >= 500) entry.errorCount += 1
  entry.totalDurationMs += durationMs
  if (durationMs > entry.maxDurationMs) entry.maxDurationMs = durationMs
  if (entry._durations.length < 1000) {
    entry._durations.push(durationMs)
  } else {
    // Replace a random element to keep reservoir sampling
    const idx = Math.floor(Math.random() * 1000)
    entry._durations[idx] = durationMs
  }
  if (heapUsedBytes != null) {
    entry.heapUsedSum += heapUsedBytes
    entry.heapSampleCount += 1
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

export function getPerfMetrics() {
  const result = []
  for (const [route, e] of Object.entries(perfState)) {
    const sorted = e._durations.slice().sort((a, b) => a - b)
    const avgDurationMs = e.count > 0 ? e.totalDurationMs / e.count : 0
    const p95DurationMs = percentile(sorted, 95)
    const avgHeapUsedMb = e.heapSampleCount > 0
      ? e.heapUsedSum / e.heapSampleCount / 1024 / 1024
      : null
    // Impact score: proportional to total CPU time spent (count * avg latency)
    const impactScore = e.count * avgDurationMs
    result.push({
      route,
      count: e.count,
      errorCount: e.errorCount,
      avgDurationMs: Math.round(avgDurationMs * 10) / 10,
      p95DurationMs: Math.round(p95DurationMs * 10) / 10,
      maxDurationMs: Math.round(e.maxDurationMs * 10) / 10,
      totalDurationMs: Math.round(e.totalDurationMs),
      avgHeapUsedMb: avgHeapUsedMb != null ? Math.round(avgHeapUsedMb * 10) / 10 : null,
      impactScore: Math.round(impactScore)
    })
  }
  // Sort highest impact first
  result.sort((a, b) => b.impactScore - a.impactScore)
  return result
}

export function recordRequestMetrics(url, statusCode) {
  if (!requestMetricsEnabled) return
  requestState.total += 1

  const routeKey = normalizeRoute(url)
  requestState.byRoute[routeKey] = (requestState.byRoute[routeKey] || 0) + 1

  const statusKey = String(statusCode || 0)
  requestState.byStatus[statusKey] =
    (requestState.byStatus[statusKey] || 0) + 1
}

export function drainRequestMetrics() {
  if (!requestMetricsEnabled) return null
  const snapshot = {
    total: requestState.total,
    byStatus: requestState.byStatus,
    byRoute: requestState.byRoute
  }
  requestState.total = 0
  requestState.byStatus = Object.create(null)
  requestState.byRoute = Object.create(null)
  return snapshot
}

export function attachSocketIoMetrics(io) {
  if (!wsMetricsEnabled || !io?.on) return
  if (io.__diagWsMetricsAttached) return
  io.__diagWsMetricsAttached = true

  io.on('connection', (socket) => {
    wsState.current += 1
    wsState.connects += 1

    socket.on('disconnect', () => {
      wsState.current = Math.max(0, wsState.current - 1)
      wsState.disconnects += 1
    })

    if (!socket.__diagWsMetricsAttached) {
      socket.__diagWsMetricsAttached = true
      socket.onAny(() => {
        wsState.messageIn += 1
      })

      const originalEmit = socket.emit
      socket.emit = function (...args) {
        wsState.messageOut += 1
        return originalEmit.apply(this, args)
      }
    }
  })
}

export function drainWsMetrics() {
  if (!wsMetricsEnabled) return null
  const snapshot = {
    currentConnections: wsState.current,
    connects: wsState.connects,
    disconnects: wsState.disconnects,
    messageIn: wsState.messageIn,
    messageOut: wsState.messageOut
  }
  wsState.connects = 0
  wsState.disconnects = 0
  wsState.messageIn = 0
  wsState.messageOut = 0
  return snapshot
}
