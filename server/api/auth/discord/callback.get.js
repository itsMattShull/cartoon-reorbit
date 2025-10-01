import jwt from 'jsonwebtoken'
import { prisma } from '@/server/prisma'

// Utility: parse a Discord “snowflake” ID into its creation Date
function parseDiscordSnowflake(snowflake) {
  const DISCORD_EPOCH = BigInt(1420070400000)
  const timestamp = (BigInt(snowflake) >> BigInt(22)) + DISCORD_EPOCH
  return new Date(Number(timestamp))
}

function getRequestIP(event) {
  return (
    event.node.req.headers['x-forwarded-for']?.split(',')[0] ||
    event.node.req.connection?.remoteAddress ||
    event.node.req.socket?.remoteAddress ||
    null
  )
}

async function getRoleIdByName(guildId, roleName, botToken) {
  const roles = await $fetch(`https://discord.com/api/guilds/${guildId}/roles`, {
    headers: { Authorization: botToken }
  })
  const role = roles.find(r => r.name === roleName)
  return role ? role.id : null
}

export default defineEventHandler(async (event) => {
  const { code, error, error_description } = getQuery(event)
  if (error) throw createError({ statusCode: 400, statusMessage: error_description || error })
  if (!code) throw createError({ statusCode: 400, statusMessage: 'Missing authorization code' })

  const config = useRuntimeConfig(event)
  const { clientId, clientSecret, redirectUri, guildId } = config.discord
  const botToken = config.botToken

  // 1) Token exchange
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
  const { access_token, refresh_token, expires_in } = tokenRes || {}
  if (!access_token) throw createError({ statusCode: 401, statusMessage: 'Token exchange failed' })
  const authHeader = { Authorization: `Bearer ${access_token}` }

  // 2) Discord user
  const discordUser = await $fetch('https://discord.com/api/users/@me', { headers: authHeader })
  const discordCreatedAt = parseDiscordSnowflake(discordUser.id)

  // 3) Best-effort auto-join to guild
  try {
    await $fetch(`https://discord.com/api/guilds/${guildId}/members/${discordUser.id}`, {
      method: 'PUT',
      headers: { Authorization: botToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token })
    })
    const memberRoleId = await getRoleIdByName(guildId, 'Member', botToken)
    if (memberRoleId) {
      await $fetch(
        `https://discord.com/api/guilds/${guildId}/members/${discordUser.id}/roles/${memberRoleId}`,
        { method: 'PUT', headers: { Authorization: botToken, 'Content-Type': 'application/json' } }
      )
    }
  } catch { /* non-fatal */ }

  // 4) Persist: allow one ACTIVE user per discordId. If existing is inactive, create a new user.
  const now = new Date()
  const tokenExpiresAt = new Date(Date.now() + expires_in * 1000)
  const displayName = discordUser.global_name || discordUser.username || 'Unknown'

  const result = await prisma.$transaction(async (tx) => {
    // find active user with this discordId
    const activeUser = await tx.user.findFirst({
      where: { discordId: discordUser.id, active: true },
    })

    // if inactive users exist with this discordId, we might need to free their email
    const inactiveUsers = await tx.user.findMany({
      where: { discordId: discordUser.id, active: false },
      select: { id: true, email: true }
    })

    // If we are going to CREATE a new active user, clear email on any inactive row that would collide
    const emailInUseByInactive = inactiveUsers.find(u => u.email && u.email === discordUser.email)

    if (!activeUser) {
      if (emailInUseByInactive) {
        await tx.user.update({
          where: { id: emailInUseByInactive.id },
          data: { email: null }
        })
      }
      // create fresh active user
      const created = await tx.user.create({
        data: {
          discordId: discordUser.id,
          discordTag: displayName,
          discordAvatar: discordUser.avatar,
          email: emailInUseByInactive ? null : discordUser.email,
          accessToken: access_token,
          refreshToken: refresh_token,
          discordCreatedAt,
          tokenExpiresAt,
          lastLogin: now,
          active: true
        }
      })
      return { user: created, isNew: true }
    }

    // else: update active user in place
    const updated = await tx.user.update({
      where: { id: activeUser.id },
      data: {
        discordTag: displayName,
        discordAvatar: discordUser.avatar,
        // keep email unique; only update if email is free or belongs to this user
        email: discordUser.email ?? activeUser.email,
        accessToken: access_token,
        refreshToken: refresh_token,
        discordCreatedAt,
        tokenExpiresAt,
        lastLogin: now
      }
    })
    return { user: updated, isNew: false }
  })

  // 4.1 Save IP
  const ip = getRequestIP(event)
  if (ip) {
    await prisma.userIP.upsert({
      where: { userId_ip: { userId: result.user.id, ip } },
      update: {},
      create: { userId: result.user.id, ip }
    })
  }

  // 5) Session cookie
  const jwtToken = jwt.sign({ sub: result.user.id }, config.jwtSecret, { expiresIn: '30d' })
  setCookie(event, 'session', jwtToken, {
    httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, path: '/'
  })

  // 6) Redirect: new accounts go to username setup
  return sendRedirect(event, result.isNew ? '/setup-username' : '/dashboard')
})
