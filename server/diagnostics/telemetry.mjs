import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import v8 from 'node:v8'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { drainRequestMetrics, drainWsMetrics } from './metrics.mjs'

const DIAG_ENABLED = process.env.DIAG_ENABLED === '1'
const DIAG_DIR = process.env.DIAG_DIR || path.join(process.cwd(), 'diagnostics')
const DIAG_INTERVAL_SEC = Number.parseInt(
  process.env.DIAG_INTERVAL_SEC || '60',
  10
)
const DIAG_LOG_MAX_MB = Number.parseInt(
  process.env.DIAG_LOG_MAX_MB || '200',
  10
)
const DIAG_ACTIVE_HANDLES = process.env.DIAG_ACTIVE_HANDLES === '1'
const DIAG_HEAPSNAP_ON_SIGNAL = process.env.DIAG_HEAPSNAP_ON_SIGNAL === '1'
const DIAG_REPORT_ON_SIGNAL = process.env.DIAG_REPORT_ON_SIGNAL === '1'

const DEFAULT_INTERVAL_SEC = 60
const DEFAULT_LOG_MAX_MB = 200
const GLOBAL_KEY = '__diagTelemetryState'

function safeNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function toMs(nanos) {
  if (!Number.isFinite(nanos)) return null
  return Math.round((nanos / 1e6) * 1000) / 1000
}

function summarizeByConstructor(items) {
  const counts = Object.create(null)
  if (!Array.isArray(items)) return { total: 0, byType: counts }
  for (const item of items) {
    const name = item?.constructor?.name || 'Unknown'
    counts[name] = (counts[name] || 0) + 1
  }
  return { total: items.length, byType: counts }
}

function getActiveHandlesSummary() {
  if (!process._getActiveHandles) return null
  try {
    return summarizeByConstructor(process._getActiveHandles())
  } catch (err) {
    return { error: err?.message || 'failed' }
  }
}

function getActiveRequestsSummary() {
  if (!process._getActiveRequests) return null
  try {
    return summarizeByConstructor(process._getActiveRequests())
  } catch (err) {
    return { error: err?.message || 'failed' }
  }
}

function ensureDir(dir) {
  return fs.promises.mkdir(dir, { recursive: true })
}

function formatTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function buildLogFileName(pid, startStamp, sequence) {
  const suffix = sequence > 0 ? `-${sequence}` : ''
  return `telemetry-${pid}-${startStamp}${suffix}.jsonl`
}

function createLogger({ dir, pid, startStamp, maxBytes }) {
  let sequence = 0
  let stream = null
  let currentSize = 0
  let currentPath = null
  let disabled = false

  const openStream = async () => {
    const fileName = buildLogFileName(pid, startStamp, sequence)
    const filePath = path.join(dir, fileName)
    const nextStream = fs.createWriteStream(filePath, { flags: 'a' })

    nextStream.on('error', (err) => {
      disabled = true
      console.error('[Diagnostics] log stream error:', err)
    })

    let size = 0
    try {
      const stats = await fs.promises.stat(filePath)
      size = stats.size
    } catch {}

    stream = nextStream
    currentSize = size
    currentPath = filePath
  }

  const rotateIfNeeded = async (bytesToWrite) => {
    if (disabled) return
    if (!stream) {
      await openStream()
      return
    }
    if (currentSize + bytesToWrite <= maxBytes) return
    if (stream) stream.end()
    sequence += 1
    await openStream()
  }

  const write = async (payload) => {
    if (disabled) return
    try {
      const line = `${JSON.stringify(payload)}\n`
      const bytes = Buffer.byteLength(line)
      await rotateIfNeeded(bytes)
      if (!stream) return
      currentSize += bytes
      stream.write(line)
    } catch (err) {
      console.error('[Diagnostics] log write failed:', err)
    }
  }

  const close = () => {
    if (stream) stream.end()
  }

  return { write, close, getPath: () => currentPath }
}

function installSignalHandlers(state) {
  if (state.signalsInstalled) return
  state.signalsInstalled = true

  process.on('SIGUSR2', () => {
    if (!DIAG_HEAPSNAP_ON_SIGNAL) return
    if (!state.diagDir) return
    const fileName = `heap-${process.pid}-${formatTimestamp()}.heapsnapshot`
    const filePath = path.join(state.diagDir, fileName)
    try {
      v8.writeHeapSnapshot(filePath)
      console.log('[Diagnostics] heap snapshot written:', filePath)
    } catch (err) {
      console.error('[Diagnostics] heap snapshot failed:', err)
    }
  })

  process.on('SIGUSR1', () => {
    if (!DIAG_REPORT_ON_SIGNAL) return
    if (!state.diagDir) return
    const stamp = formatTimestamp()

    if (process.report?.writeReport) {
      const reportPath = path.join(
        state.diagDir,
        `report-${process.pid}-${stamp}.json`
      )
      try {
        process.report.writeReport(reportPath)
        console.log('[Diagnostics] report written:', reportPath)
      } catch (err) {
        console.error('[Diagnostics] report failed:', err)
      }
    }

    const summaryPath = path.join(
      state.diagDir,
      `active-${process.pid}-${stamp}.json`
    )
    const summary = {
      timestamp: new Date().toISOString(),
      pid: process.pid,
      activeHandles: getActiveHandlesSummary(),
      activeRequests: getActiveRequestsSummary()
    }

    fs.promises
      .writeFile(summaryPath, JSON.stringify(summary, null, 2))
      .then(() => {
        console.log('[Diagnostics] active summary written:', summaryPath)
      })
      .catch((err) => {
        console.error('[Diagnostics] active summary failed:', err)
      })
  })
}

export async function startDiagnostics() {
  if (!DIAG_ENABLED) return null
  if (globalThis[GLOBAL_KEY]?.started) return globalThis[GLOBAL_KEY].controller

  const state = {
    started: true,
    diagDir: DIAG_DIR,
    signalsInstalled: false,
    controller: null
  }
  globalThis[GLOBAL_KEY] = state

  const intervalSec = safeNumber(DIAG_INTERVAL_SEC, DEFAULT_INTERVAL_SEC)
  const maxLogMb = safeNumber(DIAG_LOG_MAX_MB, DEFAULT_LOG_MAX_MB)
  const maxBytes = Math.max(1, maxLogMb) * 1024 * 1024

  try {
    await ensureDir(DIAG_DIR)
  } catch (err) {
    console.error('[Diagnostics] failed to ensure DIAG_DIR:', err)
    return null
  }

  const startStamp = formatTimestamp()
  const logger = createLogger({
    dir: DIAG_DIR,
    pid: process.pid,
    startStamp,
    maxBytes
  })

  const loopDelay = monitorEventLoopDelay({ resolution: 20 })
  loopDelay.enable()

  let lastCpu = null
  let inFlight = false

  const tick = async () => {
    if (inFlight) return
    inFlight = true
    try {
      const mem = process.memoryUsage()
      const heapStats = v8.getHeapStatistics()
      const heapSpaces = v8.getHeapSpaceStatistics()
      const cpu = process.cpuUsage()
      const cpuDelta = lastCpu
        ? {
            user: cpu.user - lastCpu.user,
            system: cpu.system - lastCpu.system
          }
        : null
      lastCpu = cpu

      const loop = {
        min: toMs(loopDelay.min),
        max: toMs(loopDelay.max),
        mean: toMs(loopDelay.mean),
        stddev: toMs(loopDelay.stddev),
        p50: loopDelay.percentile ? toMs(loopDelay.percentile(50)) : null,
        p90: loopDelay.percentile ? toMs(loopDelay.percentile(90)) : null,
        p99: loopDelay.percentile ? toMs(loopDelay.percentile(99)) : null
      }
      loopDelay.reset()

      const payload = {
        timestamp: new Date().toISOString(),
        pid: process.pid,
        ppid: process.ppid,
        uptimeSec: process.uptime(),
        memory: {
          rss: mem.rss,
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          external: mem.external,
          arrayBuffers: mem.arrayBuffers
        },
        v8: {
          heapStatistics: heapStats,
          heapSpaceStatistics: heapSpaces
        },
        eventLoopDelay: loop,
        cpuUsage: cpu,
        cpuUsageDelta: cpuDelta,
        os: {
          totalmem: os.totalmem(),
          freemem: os.freemem(),
          loadavg: os.loadavg()
        },
        activeHandles: DIAG_ACTIVE_HANDLES ? getActiveHandlesSummary() : null,
        activeRequests: getActiveRequestsSummary(),
        requestMetrics: drainRequestMetrics(),
        wsMetrics: drainWsMetrics()
      }

      await logger.write(payload)
    } catch (err) {
      console.error('[Diagnostics] telemetry tick failed:', err)
    } finally {
      inFlight = false
    }
  }

  const timer = setInterval(() => {
    void tick()
  }, intervalSec * 1000)
  timer.unref()

  await tick()
  installSignalHandlers(state)

  state.controller = {
    stop: () => {
      timer.unref()
      clearInterval(timer)
      logger.close()
    },
    logPath: logger.getPath()
  }

  return state.controller
}
