/**
 * PM2 ecosystem file — cartoon-reorbit
 *
 * Usage:
 *   First deploy:  pm2 start ecosystem.config.cjs
 *   Subsequent:    pm2 reload ecosystem.config.cjs --update-env
 *   Status:        pm2 list
 *   Logs:          pm2 logs
 *
 * Process breakdown:
 *   nuxt-server       – Nuxt 3 HTTP server, cluster mode (2 instances, stateless JWT)
 *   socket-server     – Standalone Socket.io server, fork mode (single instance,
 *                       coordinates all real-time game state)
 *   worker-mint                   – BullMQ worker: NFT minting
 *   worker-mint-end               – BullMQ worker: time-based mint window closure
 *   worker-dissolve               – BullMQ worker: account dissolution
 *   worker-dissolve-auction-launch – BullMQ worker: dissolve auction launch
 *   worker-achieve                – BullMQ worker: daily achievements
 *   guild-checker                 – Cron: Discord guild member sync
 *
 * Workers run as single fork-mode instances to prevent double-processing of jobs.
 */

'use strict'

// Load .env so NUXT_PORT / SOCKET_PORT are available at config-parse time
require('dotenv').config()

const NUXT_PORT   = process.env.NUXT_PORT   || '3000'
const SOCKET_PORT = process.env.SOCKET_PORT || '3001'

const DIAG_ENV = {
  DIAG_ENABLED:           '0',
  DIAG_DIR:               '/var/www/log/cartoon-reorbit/diagnostics',
  DIAG_INTERVAL_SEC:      '60',
  DIAG_LOG_MAX_MB:        '200',
  DIAG_HEAPSNAP_ON_SIGNAL: '1',
  DIAG_REPORT_ON_SIGNAL:  '1',
  DIAG_ACTIVE_HANDLES:    '1',
  DIAG_REQ_METRICS:       '1',
  DIAG_WS_METRICS:        '1',
}

module.exports = {
  apps: [
    // ── Nuxt HTTP server ───────────────────────────────────────────────────
    {
      name:               'nuxt-server',
      script:             '.output/server/index.mjs',
      exec_mode:          'cluster',
      instances:          2,
      // Graceful reload: PM2 waits for process.send('ready') before swapping
      wait_ready:         true,
      listen_timeout:     15000,   // ms to wait for 'ready' signal
      kill_timeout:       5000,    // ms to allow in-flight requests to finish
      node_args:          '--max-old-space-size=2048',
      max_memory_restart: '2G',
      env: {
        NODE_ENV:    'production',
        NITRO_PORT:  NUXT_PORT,
        NUXT_PORT:   NUXT_PORT,
        ...DIAG_ENV,
      },
      env_development: {
        NODE_ENV:    'production',
        NITRO_PORT:  NUXT_PORT,
        NUXT_PORT:   NUXT_PORT,
        ...DIAG_ENV,
      },
    },

    // ── Socket.io server ───────────────────────────────────────────────────
    // Single instance — game state is coordinated in this one process and
    // persisted to Redis so it survives a graceful reload.
    {
      name:               'socket-server',
      script:             'server/socket-server.js',
      exec_mode:          'fork',
      instances:          1,
      wait_ready:         true,
      listen_timeout:     15000,
      kill_timeout:       8000,    // extra time to drain active game connections
      node_args:          '--max-old-space-size=2048',
      max_memory_restart: '2G',
      env: {
        NODE_ENV:    'production',
        SOCKET_PORT: SOCKET_PORT,
        ...DIAG_ENV,
      },
      env_development: {
        NODE_ENV:    'production',
        SOCKET_PORT: SOCKET_PORT,
        ...DIAG_ENV,
      },
    },

    // ── BullMQ worker: NFT minting ─────────────────────────────────────────
    {
      name:      'worker-mint',
      script:    'server/workers/mint.worker.js',
      exec_mode: 'fork',
      instances: 1,
      env:             { NODE_ENV: 'production' },
      env_development: { NODE_ENV: 'development' },
    },

    // ── BullMQ worker: time-based mint window closure ───────────────────────
    {
      name:      'worker-mint-end',
      script:    'server/workers/mint-end.worker.js',
      exec_mode: 'fork',
      instances: 1,
      env:             { NODE_ENV: 'production' },
      env_development: { NODE_ENV: 'development' },
    },

    // ── BullMQ worker: account dissolution ────────────────────────────────
    {
      name:      'worker-dissolve',
      script:    'server/workers/dissolve.worker.js',
      exec_mode: 'fork',
      instances: 1,
      env:             { NODE_ENV: 'production' },
      env_development: { NODE_ENV: 'development' },
    },

    // ── BullMQ worker: dissolve auction launch ────────────────────────────
    {
      name:      'worker-dissolve-auction-launch',
      script:    'server/workers/dissolve-auction-launch.worker.js',
      exec_mode: 'fork',
      instances: 1,
      env:             { NODE_ENV: 'production' },
      env_development: { NODE_ENV: 'development' },
    },

    // ── BullMQ worker: daily achievements ─────────────────────────────────
    {
      name:      'worker-achieve',
      script:    'server/workers/achievements.worker.js',
      exec_mode: 'fork',
      instances: 1,
      env:             { NODE_ENV: 'production' },
      env_development: { NODE_ENV: 'development' },
    },

    // ── Cron: Discord guild member sync ───────────────────────────────────
    {
      name:      'guild-checker',
      script:    'server/cron/sync-guild-members.js',
      exec_mode: 'fork',
      instances: 1,
      env:             { NODE_ENV: 'production' },
      env_development: { NODE_ENV: 'development' },
    },
  ],
}
