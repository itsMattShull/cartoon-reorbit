// server/utils/refreshDiscordTokenAndRoles.js
import fetch from 'node-fetch'
import { prisma } from '@/server/prisma'

/**
 * Refreshes Discord OAuth2 tokens & updates roles/guild flag without throwing.
 * Skips refresh if no refreshToken or token not expired.
 */
export async function refreshDiscordTokenAndRoles(user, config) {
  const now = Date.now()

  // If there's no stored refresh token, skip (first login)
  if (!user.refreshToken) {
    return user
  }

  // If token still valid (with 60s buffer), skip
  if (user.tokenExpiresAt && user.tokenExpiresAt.getTime() > now - 60_000) {
    return user
  }

  let bodyText = ''
  try {
    const res = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type:    'refresh_token',
        refresh_token: user.refreshToken,
        redirect_uri:  config.discord.redirectUri
      })
    })
    bodyText = await res.text()

    // On invalid_grant, clear tokens, guild flags, and roles
    if (!res.ok && bodyText.includes('invalid_grant')) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          accessToken:    null,
          refreshToken:   null,
          tokenExpiresAt: null,
          inGuild:        false,
          roles:          []
        }
      })
      return { ...user, accessToken: null, refreshToken: null, tokenExpiresAt: null, inGuild: false, roles: [] }
    }

    // On other HTTP errors, log and skip
    if (!res.ok) {
      console.error('[auth] token refresh HTTP error:', res.status, bodyText)
      return user
    }
  } catch (err) {
    console.error('[auth] token refresh error:', err)
    return user
  }

  // Parse response
  let tokenJson
  try {
    tokenJson = JSON.parse(bodyText)
  } catch (err) {
    console.error('[auth] invalid JSON in token response:', bodyText)
    return user
  }

  const { access_token, refresh_token, expires_in } = tokenJson
  // Persist new tokens & expiry
  await prisma.user.update({
    where: { id: user.id },
    data: {
      accessToken:    access_token,
      refreshToken:   refresh_token ?? user.refreshToken,
      tokenExpiresAt: new Date(now + expires_in * 1000)
    }
  })

  // Fetch membership & roles
  let inGuildFlag = true
  let roleIds = []
  try {
    const memberRes = await fetch(
      `https://discord.com/api/v10/guilds/${config.discord.guildId}/members/${user.discordId}`,
      { headers: { Authorization: `Bot ${config.discord.botToken}` } }
    )
    if (!memberRes.ok) {
      console.error('[auth] membership check HTTP error:', memberRes.status)
      inGuildFlag = false
    } else {
      const memberData = await memberRes.json()
      roleIds = memberData.roles || []
    }
  } catch (err) {
    console.error('[auth] membership fetch error:', err)
    inGuildFlag = false
  }

  // Update roles & inGuild
  await prisma.user.update({
    where: { id: user.id },
    data: { roles: roleIds, inGuild: inGuildFlag }
  })
  
  return { ...user, roles: roleIds, inGuild: inGuildFlag }
}
