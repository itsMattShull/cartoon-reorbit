import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // auth
  let me = event.context.user
  if (!me) {
    const cookie = getRequestHeader(event, 'cookie') || ''
    try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
    catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  // query params
  const {
    page = '1',
    limit = '100',
    creator = '',
    status = '',
    hasBidder = '',
    ctoonName = '',
    characters = '',
    rarity = ''
  } = getQuery(event)
  const pageNum = Math.max(1, parseInt(String(page), 10) || 1)
  const take = Math.min(500, Math.max(1, parseInt(String(limit), 10) || 100))
  const skip = (pageNum - 1) * take

  // filters
  const where = {}
  if (status) where.status = String(status)
  if (creator) {
    where.creator = { username: { contains: String(creator), mode: 'insensitive' } }
  }
  if (hasBidder === 'has') where.highestBidderId = { not: null }
  if (hasBidder === 'none') where.highestBidderId = null

  const ctoonFilters = {}
  if (ctoonName) {
    ctoonFilters.name = { contains: String(ctoonName), mode: 'insensitive' }
  }
  if (rarity) ctoonFilters.rarity = String(rarity)
  if (characters) {
    const list = String(characters)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    if (list.length) ctoonFilters.characters = { hasSome: list }
  }
  if (Object.keys(ctoonFilters).length) {
    where.userCtoon = { ctoon: ctoonFilters }
  }

  const [total, rows] = await Promise.all([
    prisma.auction.count({ where }),
    prisma.auction.findMany({
      where,
      orderBy: { endAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        status: true,
        createdAt: true,
        endAt: true,
        duration: true,
        highestBid: true,
        userCtoon: {
          select: { ctoon: { select: { id: true, name: true, assetPath: true } } }
        },
        creator: { select: { id: true, username: true } },
        highestBidder: { select: { id: true, username: true } },
        bids: { select: { id: true } }
      }
    })
  ])

  return {
    page: pageNum,
    pageSize: take,
    total,
    items: rows.map(a => ({
      id: a.id,
      status: a.status,
      createdAt: a.createdAt,
      endAt: a.endAt,
      duration: a.duration,
      highestBid: a.highestBid,
      userCtoon: { ctoon: a.userCtoon?.ctoon ?? null },
      creator: a.creator ?? null,
      highestBidder: a.highestBidder ?? null,
      bids: a.bids ?? []
    }))
  }
})
