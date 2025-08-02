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

  // 2) Fetch decks with their cards & associated cToon data
  const decks = await prisma.clashDeck.findMany({
    where: { userId },
    include: {
      cards: {
        include: { ctoon: true }
      }
    },
    orderBy: { updatedAt: 'desc' }
  })

  // 3) Shape the response for the front-end
  return decks.map(deck => ({
    id:   deck.id,
    name: deck.name,
    cards: deck.cards.map(dc => ({
      id:         dc.ctoon.id,
      name:       dc.ctoon.name,
      assetPath:  dc.ctoon.assetPath,
      cost:       dc.ctoon.cost,
      power:      dc.ctoon.power,
      abilityKey: dc.ctoon.abilityKey,
      deckCardId: dc.id
    }))
  }))
})
