'use strict'

require('dotenv').config()

const NUXT_PORT   = process.env.NUXT_PORT   || '3000'
const SOCKET_PORT = process.env.SOCKET_PORT || '3001'

/**
 * PM2 ecosystem file — cartoon-reorbit (DEVELOPMENT)
 *
 * Usage:
 *   pm2 start ecosystem.dev.config.cjs
 *   pm2 logs
 *
 * Runs nuxt dev (no build required) on port 3002 alongside the
 * socket server and all background workers.
 */

module.exports = {
  apps: [
    // ── Nuxt dev server ────────────────────────────────────────────────────
    {
      name:      'nuxt-server',
      script:    'node_modules/.bin/nuxt',
      args:      'dev',
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV:   'development',
        NITRO_PORT: NUXT_PORT,
        NUXT_PORT:  NUXT_PORT,
      },
    },

    // ── Socket.io server ───────────────────────────────────────────────────
    {
      name:      'socket-server',
      script:    'server/socket-server.js',
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV:    'development',
        SOCKET_PORT: SOCKET_PORT,
      },
    },

    // ── BullMQ worker: NFT minting ─────────────────────────────────────────
    {
      name:      'worker-mint',
      script:    'server/workers/mint.worker.js',
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'development' },
    },

    // ── BullMQ worker: account dissolution ────────────────────────────────
    {
      name:      'worker-dissolve',
      script:    'server/workers/dissolve.worker.js',
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'development' },
    },

    // ── BullMQ worker: dissolve auction launch ────────────────────────────
    {
      name:      'worker-dissolve-auction-launch',
      script:    'server/workers/dissolve-auction-launch.worker.js',
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'development' },
    },

    // ── BullMQ worker: daily achievements ─────────────────────────────────
    {
      name:      'worker-achieve',
      script:    'server/workers/achievements.worker.js',
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'development' },
    },

    // ── Cron: Discord guild member sync ───────────────────────────────────
    {
      name:      'guild-checker',
      script:    'server/cron/sync-guild-members.js',
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'development' },
    },
  ],
}
