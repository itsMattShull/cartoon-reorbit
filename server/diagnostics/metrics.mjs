const diagEnabled = process.env.DIAG_ENABLED === '1'

export const requestMetricsEnabled =
  diagEnabled && process.env.DIAG_REQ_METRICS === '1'

export const wsMetricsEnabled =
  diagEnabled && process.env.DIAG_WS_METRICS === '1'

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
