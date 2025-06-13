import { refreshDiscordTokenAndRoles } from '../../utils/refreshDiscordTokenAndRoles.js'
import jwt from 'jsonwebtoken'
import { getCookie } from 'h3'
import { useRuntimeConfig } from '#imports'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  // Try middleware‑injected userId first; otherwise fall back to the persistent JWT cookie.
  let userId = event.context.userId
  if (!userId) {
    const token = getCookie(event, 'session')
    if (token) {
      try {
        const payload = jwt.verify(token, config.jwtSecret)
        userId = payload.sub
        event.context.userId = userId // make it available to downstream handlers
        return sendRedirect(event, '/dashboard', 302)
      } catch {
        const params = new URLSearchParams({
          client_id: config.discord.clientId,
          redirect_uri: config.discord.redirectUri,
          response_type: 'code',
          scope: 'identify email guilds guilds.members.read'
        })
      
        const discordAuthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`
      
        return sendRedirect(event, discordAuthUrl, 302)
      }
    } else {
      const params = new URLSearchParams({
        client_id: config.discord.clientId,
        redirect_uri: config.discord.redirectUri,
        response_type: 'code',
        scope: 'identify email guilds guilds.members.read'
      })
    
      const discordAuthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`
    
      return sendRedirect(event, discordAuthUrl, 302)
    }
  } else {
    return sendRedirect(event, '/dashboard', 302)
  }

  // if (!userId) {
  //   throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  // }
})
  