// server/api/admin/users/[id]/ctoon-categories.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

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

  const ctoons = await prisma.userCtoon.findMany({
    where: { userId: id, burnedAt: null },
    select: {
      ctoon: { select: { series: true, rarity: true } }
    }
  })

  let pokemon = 0, crazyRare = 0, other = 0

  for (const uc of ctoons) {
    const isPokemon   = (uc.ctoon?.series || '').toLowerCase() === 'pokemon'
    const isCrazyRare = (uc.ctoon?.rarity || '').toLowerCase() === 'crazy rare'
    if (isPokemon)        pokemon++
    else if (isCrazyRare) crazyRare++
    else                  other++
  }

  return { pokemon, crazyRare, other, total: ctoons.length }
})
