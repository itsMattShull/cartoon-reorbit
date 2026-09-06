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
  }
})
