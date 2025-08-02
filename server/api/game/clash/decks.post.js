// File: server/api/game/clash/decks.post.js

import { defineEventHandler, readBody, createError, getRequestHeader } from 'h3'
import { prisma } from '~/server/prisma'

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

  // 2) Parse and validate payload
  const { id, name, cardIds } = await readBody(event)
  if (
    !name ||
    !Array.isArray(cardIds) ||
    cardIds.length !== 12
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Must include a name and exactly 12 cardIds',
    })
  }

  // 3) Ensure each cardId refers to a UserCtoon belonging to this user
  const userCtoons = await prisma.userCtoon.findMany({
    where: {
      id: { in: cardIds },
      userId,
    },
    select: { ctoonId: true },
  })

  if (userCtoons.length !== cardIds.length) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'One or more selected cards are invalid or do not belong to you.',
    })
  }

  let deckRecord

  if (id) {
    // 4a) Update existing deck
    deckRecord = await prisma.clashDeck.findUnique({ where: { id } })
    if (!deckRecord || deckRecord.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Deck not found' })
    }

    // Rename the deck
    await prisma.clashDeck.update({
      where: { id },
      data: { name },
    })

    // Remove existing cards
    await prisma.clashDeckCard.deleteMany({
      where: { deckId: id },
    })

  } else {
    // 4b) Creating a new deck: enforce max 100
    const currentCount = await prisma.clashDeck.count({
      where: { userId }
    })
    if (currentCount >= 100) {
      throw createError({
        statusCode: 400,
        statusMessage:
          'You have reached the maximum of 100 decks. Please delete a deck to create a new one.',
      })
    }

    // Create the deck
    deckRecord = await prisma.clashDeck.create({
      data: { name, userId },
    })
  }

  // 5) Insert the new set of 12 cards (duplicates allowed)
  const relations = userCtoons.map(uc => ({
    deckId:  deckRecord.id,
    ctoonId: uc.ctoonId,
  }))
  await prisma.clashDeckCard.createMany({ data: relations })

  // 6) Return success
  return { success: true, deckId: deckRecord.id }
})
