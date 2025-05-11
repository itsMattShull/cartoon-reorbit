export default defineNuxtConfig({
    // Tailwind CSS integration
    modules: ['@nuxtjs/tailwindcss'],
  
    // Runtime config from .env
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
        discordInvite: process.env.DISCORD_INVITE
      } // optional for frontend-exposed vars
    },
  
    // Enable custom server middleware
    serverMiddleware: [
      '~/server/middleware/auth.js',         // verifies JWT cookie
      '~/server/middleware/guild-check.js'   // blocks non-guild users
    ]
  })