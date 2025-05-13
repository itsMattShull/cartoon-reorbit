import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function getRequestIP(event) {
  return (
    event.node.req.headers['x-forwarded-for']?.split(',')[0] ||
    event.node.req.connection?.remoteAddress ||
    event.node.req.socket?.remoteAddress ||
    null
  )
}

// Utility: fetch the role ID for a given role name
async function getRoleIdByName(guildId, roleName, botToken) {
  const roles = await $fetch(`https://discord.com/api/guilds/${guildId}/roles`, {
    headers: { Authorization: botToken }
  })
  const role = roles.find(r => r.name === roleName)
  return role ? role.id : null
}

export default defineEventHandler(async (event) => {
  const { code, error, error_description } = getQuery(event)
  if (error) {
    // Handle OAuth error response from Discord
    throw createError({
      statusCode: 400,
      statusMessage: error_description || error
    })
  }
  if (!code) {
    throw createError({ statusCode: 400, statusMessage: 'Missing authorization code' })
  }

  const config = useRuntimeConfig(event)
  const { clientId, clientSecret, redirectUri, guildId } = config.discord
  const botToken = config.botToken

  // 1. Exchange code for tokens
  const tokenRes = await $fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })

  const { access_token, refresh_token, expires_in, token_type } = tokenRes
  if (!access_token) throw createError({ statusCode: 401, statusMessage: 'Token exchange failed' })

  const authHeader = { Authorization: `Bearer ${access_token}` }

  // 2. Fetch user info
  const discordUser = await $fetch('https://discord.com/api/users/@me', { headers: authHeader })

  // 3. Auto-join user to the guild (using bot token)
  try {
    await $fetch(`https://discord.com/api/guilds/${guildId}/members/${discordUser.id}`, {
      method: 'PUT',
      headers: {
        Authorization: botToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        access_token
      })
    })

    const memberRoleId = await getRoleIdByName(guildId, 'Member', botToken)
    if (memberRoleId) {
      await $fetch(
        `https://discord.com/api/guilds/${guildId}/members/${discordUser.id}/roles/${memberRoleId}`,
        {
          method: 'PUT',
          headers: { 
            Authorization: botToken,
            'Content-Type': 'application/json' 
          }
        }
      )
    } else {
      console.warn('“Member” role not found in guild; skipping role assignment.')
    }
  } catch (err) {
    console.warn('User not auto-joined to Discord. Proceeding anyway.')
  }

  // 4. Save or update user in DB
  const user = await prisma.user.upsert({
    where: { discordId: discordUser.id },
    update: {
      discordTag: discordUser.global_name || discordUser.username || 'Unknown',
      discordAvatar: discordUser.avatar,
      email: discordUser.email,
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
      lastLogin: new Date()
    },
    create: {
      discordId: discordUser.id,
      discordTag: discordUser.global_name || discordUser.username || 'Unknown',
      email: discordUser.email,
      discordAvatar: discordUser.avatar,
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt: new Date(Date.now() + expires_in * 1000)
    }
  })

  // 4.1 Save IP address
  const ip = getRequestIP(event)
  if (ip) {
    await prisma.userIP.upsert({
      where: {
        userId_ip: {
          userId: user.id,
          ip
        }
      },
      update: {},
      create: {
        userId: user.id,
        ip
      }
    })
  }

  // 5. Create session JWT
  const jwtToken = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '30d' })

  setCookie(event, 'session', jwtToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/'                 // make it a site‑wide, persistent cookie
  })

  return sendRedirect(event, '/dashboard')
})
