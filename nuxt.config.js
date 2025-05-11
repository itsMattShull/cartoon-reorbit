export default defineNuxtConfig({
  server: {
    port: process.env.NUXT_PORT || 3000,
    host: '0.0.0.0'
  },
  // ───────────────────────────────────────────────
  // 1)  Modules
  // ───────────────────────────────────────────────
  modules: [
    '@nuxtjs/tailwindcss',
    '@prisma/nuxt'
  ],

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

    public: {
      discordInvite: process.env.DISCORD_INVITE,
      socketPort: process.env.SOCKET_PORT || 3001
    }
  },

  serverMiddleware: [
    '~/server/middleware/auth.js',
    '~/server/middleware/guild-check.js'
  ]
})