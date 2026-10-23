import { cpSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OLD_ADMIN_ROUTE_RULES } from './utils/oldAdminRedirects.js'

// sharp >= 0.35 loads its native binding through a path Nitro's file tracer can't follow, so
// @img/sharp-<platform> and @img/sharp-libvips-<platform> never reach .output/server/node_modules
// and the built server only starts if the repo's node_modules happens to be reachable. Copy the
// installed binaries into the output after the build to keep it self-contained (npm only installs
// the host platform's pair).
const IMG_DIR = fileURLToPath(new URL('./node_modules/@img', import.meta.url))
const sharpNativePackages = existsSync(IMG_DIR)
  ? readdirSync(IMG_DIR).filter(name => name.startsWith('sharp-'))
  : []

export default defineNuxtConfig({
  app: {
    head: {
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ]
    }
  },
  server: {
    port: process.env.NUXT_PORT || 3000,
    host: '0.0.0.0'
  },

  // ───────────────────────────────────────────────
  // 0)  Components – register newsite/ without path prefix
  // ───────────────────────────────────────────────
  components: [
    '~/components',
    { path: '~/components/newsite', pathPrefix: false },
    { path: '~/components/effects', pathPrefix: false }
  ],

  // ───────────────────────────────────────────────
  // 1)  Modules
  // ───────────────────────────────────────────────
  modules: ['@nuxtjs/tailwindcss'],

  // ───────────────────────────────────────────────
  // 2)  Vite alias → fixes the ".prisma/client/index-browser" error
  // ───────────────────────────────────────────────
  vite: {
    build: {
      // three.js is already split into its own lazily-loaded chunk (~510 kB minified) and can't be
      // broken up further; raise the limit just past it so the warning stays useful for new bloat.
      chunkSizeWarningLimit: 600
    },
    resolve: {
      alias: {
        '.prisma/client/index-browser':
          './node_modules/.prisma/client/index-browser.js'
        // If you prefer absolute paths:
        // '.prisma/client/index-browser': new URL('./node_modules/.prisma/client/index-browser.js', import.meta.url).pathname
      }
    }
  },

  // ───────────────────────────────────────────────
  // Old /admin/* URLs → the /newsite/admin console
  // ───────────────────────────────────────────────
  routeRules: {
    ...OLD_ADMIN_ROUTE_RULES
  },

  // ───────────────────────────────────────────────
  // 3)  Your existing settings
  // ───────────────────────────────────────────────
  runtimeConfig: {
    jwtSecret: process.env.JWT_SECRET,

    discord: {
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      redirectUri: process.env.DISCORD_REDIRECT_URI,
      guildId: process.env.DISCORD_GUILD_ID,
      invite: process.env.DISCORD_INVITE
    },

    botToken: process.env.BOT_TOKEN,

    // server-only
    socketOrigin: process.env.SOCKET_ORIGIN || 'http://localhost:3001',
    socketPath: process.env.SOCKET_PATH || '/socket.io',
    socketMetricsToken: process.env.SOCKET_METRICS_TOKEN,
    // Proves to server/socket-server.js that a 'new-bid' emit came from this
    // process's own bid.post.js bridge connection, not from an arbitrary
    // browser socket (see the matching check in socket-server.js — without it,
    // anyone can spoof a fake bid amount/winner name into a live auction room).
    // Falls back to JWT_SECRET, which every working deployment already has set,
    // so this closes the hole with no new required config; set a dedicated
    // SOCKET_BRIDGE_SECRET to use a separate value instead.
    socketBridgeSecret: process.env.SOCKET_BRIDGE_SECRET || process.env.JWT_SECRET,

    public: {
      discordInvite: process.env.DISCORD_INVITE,
      socketPort: process.env.SOCKET_PORT || 3001,
      viewNewDesign: process.env.VIEWNEWDESIGN || '0'
    }
  },

  serverMiddleware: [
    '~/server/middleware/auth.js',
    '~/server/middleware/guild-check.js',
    '~/server/middleware/daily-points.js'
  ],

  sourcemap: {
    client: 'hidden'
  },

  nitro: {
    hooks: {
      compiled(nitro) {
        for (const name of sharpNativePackages) {
          cpSync(join(IMG_DIR, name), join(nitro.options.output.serverDir, 'node_modules/@img', name), { recursive: true })
        }
      }
    }
  }
})
