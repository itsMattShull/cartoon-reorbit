// File: server/api/game/oggtoons/decks.post.js
// Creates or updates an original gToons (2002) deck: exactly 12 owned isOgGtoon cToons at
// unique positions 0-11 (position 11 = the goal card).
import { defineEventHandler, readBody, createError, getRequestHeader } from 'h3'
import { prisma } from '~/server/prisma'
import { validateDeckPositions } from '~/server/utils/ogGtoonEngine'
import { getOgGtoonsConfig } from '~/server/utils/ogGtoonsConfig'

export default defineEventHandler(async (event) => {
  // 1) Authenticate
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const { deckBuildingEnabled } = await getOgGtoonsConfig()
  if (!deckBuildingEnabled) {
    throw createError({ statusCode: 403, statusMessage: 'gToons deck building is currently unavailable.' })
  }

  // 2) Parse and validate payload
  const { id, name, cards } = await readBody(event)
  // cards: [{ ctoonId, position }] — exactly 12, unique positions 0-11
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Deck name is required' })
  }
  if (!validateDeckPositions(cards)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Deck must have exactly 12 cards at unique positions 0-11'
    })
  }
  const ctoonIds = cards.map(c => c.ctoonId)
  if (new Set(ctoonIds).size !== 12) {
    // Original gToons decks are 12 DISTINCT cards (unlike Clash, which allows duplicates) —
    // the deck's order matters and a duplicate card at two positions is nonsensical.
    throw createError({ statusCode: 400, statusMessage: 'A deck cannot contain the same cToon twice' })
  }

  // 3) Ensure every ctoonId is a UserCtoon this user owns, of an isOgGtoon Ctoon
  const ownedRows = await prisma.userCtoon.findMany({
    where: { userId, ctoonId: { in: ctoonIds }, ctoon: { is: { isOgGtoon: true } } },
    select: { ctoonId: true },
    distinct: ['ctoonId']
  })
  const ownedSet = new Set(ownedRows.map(r => r.ctoonId))
  if (ownedSet.size !== 12 || ctoonIds.some(id => !ownedSet.has(id))) {
    throw createError({
      statusCode: 400,
      statusMessage: 'One or more selected cards are invalid, not gToons, or do not belong to you.'
    })
  }

  let deckRecord

  if (id) {
    // 4a) Update existing deck
    deckRecord = await prisma.ogGtoonDeck.findUnique({ where: { id } })
    if (!deckRecord || deckRecord.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Deck not found' })
    }
    await prisma.ogGtoonDeck.update({ where: { id }, data: { name: name.trim() } })
    await prisma.ogGtoonDeckCard.deleteMany({ where: { deckId: id } })
  } else {
    // 4b) Creating a new deck: enforce max 100 (mirrors Clash's cap)
    const currentCount = await prisma.ogGtoonDeck.count({ where: { userId } })
    if (currentCount >= 100) {
      throw createError({
        statusCode: 400,
        statusMessage: 'You have reached the maximum of 100 decks. Please delete a deck to create a new one.'
      })
    }
    deckRecord = await prisma.ogGtoonDeck.create({ data: { name: name.trim(), userId } })
  }

  // 5) Insert the 12 cards at their positions
  await prisma.ogGtoonDeckCard.createMany({
    data: cards.map(c => ({ deckId: deckRecord.id, ctoonId: c.ctoonId, position: c.position }))
  })

  return { success: true, deckId: deckRecord.id }
})
