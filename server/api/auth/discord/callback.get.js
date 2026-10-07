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

// Logs a step only when it is slow, so a stalled login (locked user row, rate-limited
// Discord call, exhausted pool) shows exactly where the time went.
const SLOW_STEP_MS = 2000
async function timed(label, fn, discordId) {
  const start = Date.now()
  try {
    return await fn()
  } finally {
    const ms = Date.now() - start
    if (ms >= SLOW_STEP_MS) {
      console.warn(`[discord-callback] slow step "${label}" took ${ms}ms${discordId ? ` (discordId=${discordId})` : ''}`)
    }
  }
}

export default defineEventHandler(async (event) => {
  const { code, error, error_description } = getQuery(event)
  if (error) throw createError({ statusCode: 400, statusMessage: error_description || error })
  if (!code) throw createError({ statusCode: 400, statusMessage: 'Missing authorization code' })

  const config = useRuntimeConfig(event)
  const { clientId, clientSecret, redirectUri, guildId } = config.discord
  const botToken = config.botToken

  // 1) Token exchange
  let tokenRes
  try {
    tokenRes = await timed('token exchange', () => $fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }))
  } catch (err) {
    // A code is single-use and short-lived: a reload/retry of the callback URL (or a
    // callback that stalled and was retried) comes back as invalid_grant. Send the user
    // back to start a fresh login instead of surfacing an unhandled 500.
    if (err?.data?.error === 'invalid_grant') {
      console.warn('[discord-callback] invalid_grant (code already used or expired)')
      return sendRedirect(event, '/?loginError=expired')
    }
    throw err
  }
  const { access_token, refresh_token, expires_in } = tokenRes || {}
  if (!access_token) throw createError({ statusCode: 401, statusMessage: 'Token exchange failed' })
  const authHeader = { Authorization: `Bearer ${access_token}` }

  // 2) Discord user
  const discordUser = await timed('discord @me', () => $fetch('https://discord.com/api/users/@me', { headers: authHeader }))
  const discordCreatedAt = parseDiscordSnowflake(discordUser.id)

  // 🚫 If any row for this discordId is banned, refuse login/creation
  const bannedRow = await timed('ban check', () => prisma.user.findFirst({
    where: { discordId: discordUser.id, banned: true },
    select: { id: true }
  }), discordUser.id)
  if (bannedRow) {
    // no session cookie, just bounce with a banner
    return sendRedirect(event, '/join-discord?banned=1')
  }

  // 🚫 Temporary suspension — checked against the ACTIVE row only (not any inactive/dissolved
  // one), since that's the account identity actually being logged into. See User.suspendedUntil's
  // schema comment for why this is kept separate from `banned`.
  const activeRowForSuspension = await timed('suspension check', () => prisma.user.findFirst({
    where: { discordId: discordUser.id, active: true },
    select: { suspendedUntil: true }
  }), discordUser.id)
  if (activeRowForSuspension?.suspendedUntil && activeRowForSuspension.suspendedUntil > new Date()) {
    return sendRedirect(event, `/join-discord?suspended=1&until=${encodeURIComponent(activeRowForSuspension.suspendedUntil.toISOString())}`)
  }

  // 3) Best-effort auto-join to guild
  try {
    await timed('guild auto-join', async () => {
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
    }, discordUser.id)
  } catch { /* non-fatal */ }

  // 4) Persist: allow one ACTIVE user per discordId. If existing is inactive, create a new user.
  const now = new Date()
  const tokenExpiresAt = new Date(Date.now() + expires_in * 1000)
  const displayName = discordUser.global_name || discordUser.username || 'Unknown'

  let result
  try {
    const existingActive = await timed('find active user', () => prisma.user.findFirst({
      where: { discordId: discordUser.id, active: true },
    }), discordUser.id)

    if (existingActive) {
      // Existing user: a plain update, not an interactive transaction. An interactive
      // transaction has a 5s window, so if this row is locked by another transaction
      // (e.g. a worker holding the official account's row) the update would only run
      // after the window expired and fail with P2028 after minutes of waiting.
      const updated = await timed('update user (row lock?)', () => prisma.user.update({
        where: { id: existingActive.id },
        data: {
          discordUsername: discordUser.username || null,
          discordTag: displayName,
          discordAvatar: discordUser.avatar,
          // keep email unique; only update if email is free or belongs to this user
          email: discordUser.email ?? existingActive.email,
          accessToken: access_token,
          refreshToken: refresh_token,
          discordCreatedAt,
          tokenExpiresAt,
          lastLogin: now
        }
      }), discordUser.id)
      result = { user: updated, isNew: false }
    } else {
      // New user: if inactive users with this discordId exist, we may need to free their
      // email first so the create doesn't collide — keep both writes atomic.
      result = await prisma.$transaction(async (tx) => {
        const inactiveUsers = await tx.user.findMany({
          where: { discordId: discordUser.id, active: false },
          select: { id: true, email: true }
        })
        const emailInUseByInactive = inactiveUsers.find(u => u.email && u.email === discordUser.email)
        if (emailInUseByInactive) {
          await tx.user.update({
            where: { id: emailInUseByInactive.id },
            data: { email: null }
          })
        }
        const created = await tx.user.create({
          data: {
            discordId: discordUser.id,
            discordUsername: discordUser.username || null,
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
      })
    }
  } catch (err) {
    console.error(`[discord-callback] failed to persist login for discordId=${discordUser.id}:`, err?.message || err)
    throw err
  }

  // 4.1 Save IP
  const ip = getRequestIP(event)
  if (ip) {
    await timed('save ip', () => prisma.userIP.upsert({
      where: { userId_ip: { userId: result.user.id, ip } },
      update: {},
      create: { userId: result.user.id, ip }
    }), discordUser.id)
  }

  // 5) Session cookie
  const jwtToken = jwt.sign({ sub: result.user.id }, config.jwtSecret, { expiresIn: '30d' })
  setCookie(event, 'session', jwtToken, {
    httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, path: '/'
  })

  // 6) Redirect: new accounts go to username setup
  if (result.isNew) return sendRedirect(event, '/setup-username')
  return sendRedirect(event, '/newsite/home')
})
