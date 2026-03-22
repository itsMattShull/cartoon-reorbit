import { defineEventHandler, getRequestHeader, readBody, createError, getRouterParam } from 'h3'
import { prisma } from '@/server/prisma'

const VALID_RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare', 'Prize Only', 'Code Only', 'Auction Only']

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  const existing = await prisma.submittedCtoon.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Submission not found.' })
  if (existing.status !== 'PENDING') throw createError({ statusCode: 400, statusMessage: 'Can only edit pending submissions.' })

  const {
    name, series, set: setField, description, rarity,
    releaseDate: releaseDateRaw, characters, totalQuantity,
    initialQuantity, perUserLimit, inCmart, price
  } = body

  if (name !== undefined && !String(name).trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Name cannot be empty.' })
  }
  if (rarity !== undefined && !VALID_RARITIES.includes(rarity)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid rarity.' })
  }

  const updateData = {}
  if (name !== undefined) updateData.name = String(name).trim()
  if (series !== undefined) updateData.series = String(series).trim()
  if (setField !== undefined) updateData.set = String(setField).trim()
  if (description !== undefined) updateData.description = description ? String(description).trim() : null
  if (rarity !== undefined) updateData.rarity = rarity
  if (releaseDateRaw !== undefined) {
    const d = new Date(releaseDateRaw)
    if (isNaN(d)) throw createError({ statusCode: 400, statusMessage: 'Invalid release date.' })
    updateData.releaseDate = d
  }
  if (characters !== undefined) {
    const arr = Array.isArray(characters) ? characters : JSON.parse(characters)
    if (!arr.length) throw createError({ statusCode: 400, statusMessage: 'Characters cannot be empty.' })
    updateData.characters = arr
  }
  if (totalQuantity !== undefined) {
    updateData.totalQuantity = totalQuantity === '' || totalQuantity == null ? null : parseInt(totalQuantity, 10)
  }
  if (initialQuantity !== undefined) {
    updateData.initialQuantity = initialQuantity === '' || initialQuantity == null ? null : parseInt(initialQuantity, 10)
  }
  if (perUserLimit !== undefined) {
    updateData.perUserLimit = perUserLimit === '' || perUserLimit == null ? null : parseInt(perUserLimit, 10)
  }
  if (inCmart !== undefined) updateData.inCmart = Boolean(inCmart)
  if (price !== undefined) updateData.price = parseInt(price, 10) || 0

  const totQty = updateData.totalQuantity !== undefined ? updateData.totalQuantity : existing.totalQuantity
  const initQty = updateData.initialQuantity !== undefined ? updateData.initialQuantity : existing.initialQuantity
  if (initQty != null && totQty != null && initQty > totQty) {
    throw createError({ statusCode: 400, statusMessage: 'Initial quantity cannot exceed total quantity.' })
  }

  const updated = await prisma.submittedCtoon.update({
    where: { id },
    data: updateData,
    include: {
      user: { select: { id: true, username: true, discordTag: true, discordAvatar: true } }
    }
  })

  return updated
})
