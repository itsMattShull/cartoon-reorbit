import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

function parseStartYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T00:00:00.000Z`)
  return isNaN(d.getTime()) ? null : d
}

function parseEndYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T23:59:59.999Z`)
  return isNaN(d.getTime()) ? null : d
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

  const { start, end, packId, set, rarity } = getQuery(event)

  if (!rarity || typeof rarity !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'rarity is required' })
  }

  let endDate = (typeof end === 'string' && parseEndYMD(end)) || new Date()
  let startDate = (typeof start === 'string' && parseStartYMD(start)) || null

  if (!startDate) {
    const s = new Date(endDate)
    s.setDate(s.getDate() - 29)
    startDate = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 0, 0, 0, 0))
  }

  if (startDate > endDate) {
    const tmp = startDate
    startDate = endDate
    endDate = tmp
  }

  let ctoonIdFilter = undefined
  if (packId && typeof packId === 'string') {
    const opts = await prisma.packCtoonOption.findMany({
      where: { packId },
      select: { ctoonId: true }
    })
    ctoonIdFilter = { in: opts.map(o => o.ctoonId) }
  }

  const ctoonWhere = {
    rarity,
    ...(ctoonIdFilter ? { id: ctoonIdFilter } : {}),
    ...(set && typeof set === 'string' ? { set } : {})
  }

  // Get distinct ctoon IDs that appear in userCtoon within the date range
  const userCtoons = await prisma.userCtoon.findMany({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      ctoon: ctoonWhere
    },
    select: {
      ctoonId: true,
      ctoon: {
        select: { id: true, name: true, assetPath: true, rarity: true, inCmart: true }
      }
    },
    distinct: ['ctoonId']
  })

  const ctoons = userCtoons
    .map(uc => uc.ctoon)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))

  return { rarity, ctoons }
})
