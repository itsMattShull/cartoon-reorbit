// server/api/users/search.get.js
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  /* 1. Auth check ------------------------------------------------ */
  const requesterId = event.context.userId
  if (!requesterId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  /* 2. Parse query params --------------------------------------- */
  const { q = '', limit = '20', offset = '0', role, roles, inGuild, isBooster, ids } = getQuery(event)

  const toInt = (v, d) => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : d
  }
  const parseBool = (v) => {
    if (v === undefined || v === null || v === '') return undefined
    const s = String(v).toLowerCase()
    if (s === 'true') return true
    if (s === 'false') return false
    return undefined
  }

  const take = Math.min(Math.max(toInt(limit, 20), 1), 100)   // 1..100
  const skip = Math.max(toInt(offset, 0), 0)
  const query = String(q || '')

  const roleList = String(roles ?? role ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const idList = String(ids ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  /* 3. Build Prisma filters ------------------------------------- */
  const where = {
    AND: [
      query
        ? {
            OR: [
              { username:   { contains: query, mode: 'insensitive' } },
              { discordTag: { contains: query, mode: 'insensitive' } },
              { discordId:  { contains: query } },
              { id:         { contains: query } }
            ]
          }
        : {},
      roleList.length ? { roles: { hasSome: roleList } } : {},
      parseBool(inGuild)   !== undefined ? { inGuild:   parseBool(inGuild) }   : {},
      parseBool(isBooster) !== undefined ? { isBooster: parseBool(isBooster) } : {},
      idList.length ? { id: { in: idList } } : {}
    ]
  }

  /* 4. Query ----------------------------------------------------- */
  try {
    const [rows, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        take,
        skip,
        orderBy: [{ isBooster: 'desc' }, { username: 'asc' }],
        select: {
          id: true,
          username: true,
          discordId: true,
          discordTag: true,
          discordAvatar: true,
          avatar: true,
          roles: true,
          isAdmin: true,
          inGuild: true,
          isBooster: true,
          boosterSince: true,
          createdAt: true,
          lastLogin: true,
          points: { select: { points: true } } // UserPoints relation
        }
      }),
      prisma.user.count({ where })
    ])

    /* 5. Shape response ------------------------------------------ */
    const items = rows.map(u => ({
      id: u.id,
      username: u.username,
      discordId: u.discordId,
      discordTag: u.discordTag,
      discordAvatar: u.discordAvatar,
      avatar: u.avatar,
      roles: u.roles,
      isAdmin: u.isAdmin,
      inGuild: u.inGuild,
      isBooster: u.isBooster,
      boosterSince: u.boosterSince,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin,
      points: u.points?.points ?? 0
    }))

    return {
      total,
      count: items.length,
      limit: take,
      offset: skip,
      items
    }
  } catch (err) {
    console.error(err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to search users' })
  }
})
