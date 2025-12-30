import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const { q = '', limit = '10', usernames, discordIds } = getQuery(event)
  const take = Math.min(Math.max(parseInt(String(limit), 10) || 10, 1), 50)

  const usernameList = String(usernames || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const discordIdList = String(discordIds || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  let where = {}
  if (discordIdList.length) {
    where = { discordId: { in: discordIdList } }
  } else if (usernameList.length) {
    where = {
      OR: usernameList.map(name => ({ username: { equals: name, mode: 'insensitive' } }))
    }
  } else {
    const query = String(q || '').trim().replace(/^@+/, '')
    if (!query) return { items: [] }
    where = {
      username: { contains: query, mode: 'insensitive' }
    }
  }

  const rows = await db.user.findMany({
    where,
    take,
    orderBy: { username: 'asc' },
    select: { id: true, username: true, discordId: true }
  })

  const items = rows
    .filter(r => r.username)
    .map(r => ({ id: r.id, username: r.username, discordId: r.discordId || null }))

  return { items }
})
