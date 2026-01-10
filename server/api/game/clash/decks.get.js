// File: server/api/game/clash/decks.get.js
import { defineEventHandler, createError, getRequestHeader } from 'h3'
import { prisma } from '~/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Authenticate the user
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch (err) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const userId = me?.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2) Fetch user's owned ctoons
  const ownedCtoons = await prisma.userCtoon.findMany({
    where: { userId },
    select: { ctoonId: true }
  })
  const ownedSet = new Set(ownedCtoons.map(u => u.ctoonId))

  // 3) Fetch decks with their cards & associated cToon data
  const decks = await prisma.clashDeck.findMany({
    where: { userId },
    include: {
      cards: {
        include: { ctoon: true }
      }
    },
    orderBy: { updatedAt: 'desc' }
  })

  const response = []
  for (const deck of decks) {
    // Identify cards the user no longer owns
    const invalidCards = deck.cards.filter(dc => !ownedSet.has(dc.ctoonId))
    const invalidIds = invalidCards.map(dc => dc.id)
    if (invalidIds.length > 0) {
      // Remove invalid cards from the deck
      await prisma.clashDeckCard.deleteMany({
        where: { id: { in: invalidIds } }
      })
    }

    // Filter out invalid cards for the response
    const validCards = deck.cards.filter(dc => ownedSet.has(dc.ctoonId))

    response.push({
      id: deck.id,
      name: deck.name,
      cards: validCards.map(dc => ({
        id:         dc.ctoon.id,
        name:       dc.ctoon.name,
        assetPath:  dc.ctoon.assetPath,
        cost:       dc.ctoon.cost,
        power:      dc.ctoon.power,
        gtoonType:  dc.ctoon.gtoonType || null,
        abilityKey: dc.ctoon.abilityKey,
        deckCardId: dc.id
      }))
    })
  }

  // 4) Return the response
  return response
})
