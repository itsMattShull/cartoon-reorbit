/**
 * PM2 Ecosystem Config — Split Deployment
 *
 * Web droplet  ($24/mo, 4 GB / 2 vCPU):
 *   pm2 start ecosystem.config.cjs --only web,socket
 *
 * Workers droplet  ($12/mo, 2 GB / 1 vCPU):
 *   pm2 start ecosystem.config.cjs --only mint-worker,achievements-worker,guild-checker
 *
 *   On the workers droplet set:
 *     REDIS_HOST=<web-droplet-private-ip>
 *     DATABASE_URL=postgresql://...@<web-droplet-private-ip>:5432/orbitdb
 *     PRISMA_POOL_SIZE=3
 *
 * Single-droplet (current setup):
 *   pm2 start ecosystem.config.cjs
 */

module.exports = {
  apps: [
    // ── Web server ────────────────────────────────────────────
    {
      name: 'web',
      script: './node_modules/nuxt/bin/nuxt.mjs',
      args: 'start',
      max_memory_restart: '1400M',
      env: {
        NODE_ENV: 'production',
        PRISMA_POOL_SIZE: '10',
      },
    },

    // ── Socket.io server ──────────────────────────────────────
    {
      name: 'socket',
      script: 'server/socket-server.js',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },

    // ── Mint worker ───────────────────────────────────────────
    {
      name: 'mint-worker',
      script: 'server/workers/mint.worker.js',
      max_memory_restart: '384M',
      env: {
        NODE_ENV: 'production',
        PRISMA_POOL_SIZE: '3',
      },
    },

    // ── Achievements worker ───────────────────────────────────
    {
      name: 'achievements-worker',
      script: 'server/workers/achievements.worker.js',
      max_memory_restart: '384M',
      env: {
        NODE_ENV: 'production',
        PRISMA_POOL_SIZE: '3',
      },
    },

    // ── Guild checker / cron ──────────────────────────────────
    {
      name: 'guild-checker',
      script: 'server/cron/sync-guild-members.js',
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PRISMA_POOL_SIZE: '3',
      },
    },
  ],
}
