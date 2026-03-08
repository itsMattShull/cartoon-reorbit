import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

// Validates that username consists of exactly 3 PascalCase words with no spaces
// e.g. "AwesomeAlienAce" passes, "awesome alien ace" or "AwesomeAlien" fails
function isValidAdminUsername(str) {
  if (!str || typeof str !== 'string') return false
  // Must have no spaces and match exactly 3 words: each starting with uppercase followed by 1+ lowercase letters
  return /^([A-Z][a-z]+){3}$/.test(str)
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const body = await readBody(event)
  const username = body?.username?.trim()

  if (!username) {
    throw createError({ statusCode: 400, statusMessage: 'Username is required' })
  }

  if (!isValidAdminUsername(username)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Username must be 3 words each starting with a capital letter and no spaces (e.g. AwesomeAlienAce)'
    })
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, discordId: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  if (target.username === username) {
    throw createError({ statusCode: 400, statusMessage: 'That is already this user\'s current username' })
  }

  // Check uniqueness
  const existing = await prisma.user.findFirst({ where: { username } })
  if (existing) throw createError({ statusCode: 409, statusMessage: 'Username already taken' })

  const prevUsername = target.username

  // Update DB
  await prisma.user.update({
    where: { id: target.id },
    data: { username, usernameChangedAt: new Date() }
  })

  // Update Discord nickname
  const { botToken, discord } = useRuntimeConfig(event)
  try {
    await $fetch(
      `https://discord.com/api/guilds/${discord.guildId}/members/${target.discordId}`,
      {
        method: 'PATCH',
        headers: { Authorization: botToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nick: username })
      }
    )
  } catch (err) {
    console.warn('Discord nickname update skipped (likely owner or not in guild):', err?.response?.status || err)
  }

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'username',
    prevValue: { username: prevUsername },
    newValue: { username }
  })

  return { ok: true, username }
})
