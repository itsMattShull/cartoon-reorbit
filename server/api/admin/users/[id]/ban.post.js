// server/api/admin/users/[id]/ban.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  // 1) Auth: must be admin
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

  // 2) Params & body
  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const body = await readBody(event)
  const reason = (body?.reason || '').trim()
  if (!reason || reason.length < 10) {
    throw createError({ statusCode: 400, statusMessage: 'Reason must be at least 10 characters.' })
  }

  // 3) Load target user
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, isAdmin: true, active: true, banned: true, discordId: true, username: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (target.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Cannot ban another admin' })

  // 4) Update DB first
  const prev = { active: target.active, banned: target.banned }
  await prisma.user.update({
    where: { id: target.id },
    data: {
      active: false,
      banned: true,
    }
  })

  // Write a ban note
  await prisma.userBanNote.create({
    data: {
      userId: target.id,
      adminId: me.id,
      action: 'BAN',
      reason,
    }
  })

  // Log the admin action (best-effort, non-blocking)
  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'banUser',
    prevValue: prev,
    newValue: { active: false, banned: true, reason }
  })

  // 5) Attempt Discord guild ban (best-effort but reportable)
  let discord = { ok: false, status: null, message: null }
  try {
    const rawToken = process.env.BOT_TOKEN
    const guildId  = process.env.DISCORD_GUILD_ID
    if (target.discordId && rawToken && guildId) {
      const auth = rawToken.startsWith('Bot ') ? rawToken : `Bot ${rawToken}`
      const audit = `Ban by ${me.username || me.id}: ${reason}`
      const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/bans/${target.discordId}`, {
        method: 'PUT',
        headers: {
          'Authorization': auth,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ delete_message_days: 7 , reason: encodeURIComponent(audit).slice(0, 50)})
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.warn('Discord ban request failed:', res.status, text)
        discord = { ok: false, status: res.status, message: text }
      } else {
        discord = { ok: true, status: res.status, message: 'OK' }
      }
    } else if (!rawToken || !guildId) {
      discord = { ok: false, status: 0, message: 'Missing BOT_TOKEN or DISCORD_GUILD_ID' }
    }
  } catch (err) {
    console.warn('Discord ban failed:', err?.message || err)
    discord = { ok: false, status: -1, message: String(err?.message || err) }
  }

  return { ok: true, discord }
})
