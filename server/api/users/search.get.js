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
          username: true,
          avatar: true,
          isBooster: true
        }
      }),
      prisma.user.count({ where })
    ])

    /* 5. Shape response ------------------------------------------ */
    const items = rows.map(u => ({
      username: u.username,
      avatar: u.avatar,
      isBooster: u.isBooster
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
