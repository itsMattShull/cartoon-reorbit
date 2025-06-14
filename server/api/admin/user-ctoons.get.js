// server/api/admin/user-ctoons.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // --- auth/admin check via session cookie ---
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

  // --- parse query parameters ---
  const {
    skip = '0',
    take = '20',
    sort = 'createdAt',
    dir = 'desc',
    rarity,
    owner,
    acquiredFrom,
    acquiredTo,
    ctoonName
  } = getQuery(event)

  const skipNum = parseInt(skip, 10) || 0
  const takeNum = parseInt(take, 10) || 20
  const orderDir = dir === 'desc' ? 'desc' : 'asc'

  // --- build dynamic WHERE filters ---
  const where = {}
  if (rarity) {
    where.ctoon = { ...(where.ctoon || {}), rarity }
  }
  if (ctoonName) {
    where.ctoon = {
      ...(where.ctoon || {}),
      name: { contains: ctoonName, mode: 'insensitive' }
    }
  }
  if (owner) {
    where.user = {
      username: { contains: owner, mode: 'insensitive' }
    }
  }
  if (acquiredFrom) {
    where.createdAt = { ...(where.createdAt || {}), gte: new Date(acquiredFrom) }
  }
  if (acquiredTo) {
    where.createdAt = { ...(where.createdAt || {}), lte: new Date(acquiredTo) }
  }

  // --- build dynamic ORDER BY ---
  const orderBy = []
  switch (sort) {
    case 'mintNumber':
      orderBy.push({ mintNumber: orderDir })
      break
    case 'createdAt':
      orderBy.push({ createdAt: orderDir })
      break
    case 'rarity':
      orderBy.push({ ctoon: { rarity: orderDir } })
      break
    case 'username':
      orderBy.push({ user: { username: orderDir } })
      break
    case 'ctoonName':
      orderBy.push({ ctoon: { name: orderDir } })
      break
    default:
      orderBy.push({ createdAt: orderDir })
  }

  // --- fetch UserCtoon rows with related Ctoon & User ---
  const raws = await prisma.userCtoon.findMany({
    skip: skipNum,
    take: takeNum,
    where,
    orderBy,
    select: {
      id:             true,
      mintNumber:     true,
      createdAt:      true,
      isFirstEdition: true,
      ctoonId:        true,
      ctoon: {
        select: {
          id:          true,
          assetPath:   true,
          name:        true,
          releaseDate: true,
          rarity:      true,
          quantity:    true,
          inCmart:     true
        }
      },
      user: {
        select: { username: true }
      }
    }
  })

  // --- compute highestMint per ctoonId via groupBy ---
  const ctoonIds = [...new Set(raws.map(r => r.ctoonId))]
  const agg = await prisma.userCtoon.groupBy({
    by: ['ctoonId'],
    where: { ctoonId: { in: ctoonIds } },
    _max: { mintNumber: true }
  })
  const highestMap = {}
  agg.forEach(cur => {
    highestMap[cur.ctoonId] = cur._max.mintNumber
  })

  // --- flatten & attach highestMint ---
  return raws.map(r => ({
    id:             r.id,
    mintNumber:     r.mintNumber,
    createdAt:      r.createdAt,
    isFirstEdition: r.isFirstEdition,
    username:       r.user.username,
    ctoon: {
      ...r.ctoon,
      highestMint: highestMap[r.ctoonId] ?? null
    }
  }))
})
