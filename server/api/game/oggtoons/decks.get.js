// File: server/api/game/oggtoons/decks.get.js
// Lists the caller's original gToons (2002) decks, cards ordered by position (0-11).
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

  // 2) Fetch user's owned OG gToon-eligible UserCtoons (ctoonId set, not UserCtoon id — a deck
  // card references a specific Ctoon, and ownership is re-checked by ctoonId, same as decks.post)
  const ownedCtoons = await prisma.userCtoon.findMany({
    where: { userId, ctoon: { is: { isOgGtoon: true } } },
    select: { ctoonId: true }
  })
  const ownedSet = new Set(ownedCtoons.map(u => u.ctoonId))

  // 3) Fetch decks with their cards & associated cToon data, ordered by position
  const decks = await prisma.ogGtoonDeck.findMany({
    where: { userId },
    include: {
      cards: {
        include: { ctoon: true },
        orderBy: { position: 'asc' }
      }
    },
    orderBy: { updatedAt: 'desc' }
  })

  const response = decks.map(deck => ({
    id: deck.id,
    name: deck.name,
    updatedAt: deck.updatedAt,
    goalColor: deck.cards.find(c => c.position === 11)?.ctoon?.gtoonColor || null,
    valid: deck.cards.length === 12 && deck.cards.every(c => ownedSet.has(c.ctoonId) && c.ctoon?.isOgGtoon),
    cards: deck.cards.map(dc => ({
      id: dc.ctoon.id,
      name: dc.ctoon.name,
      assetPath: dc.ctoon.assetPath,
      characters: dc.ctoon.characters || [],
      gtoonColor: dc.ctoon.gtoonColor,
      gtoonValue: dc.ctoon.gtoonValue,
      isSlamGtoon: dc.ctoon.isSlamGtoon,
      gtoonEffect: dc.ctoon.gtoonEffect,
      position: dc.position,
      owned: ownedSet.has(dc.ctoonId) && dc.ctoon?.isOgGtoon === true,
      deckCardId: dc.id
    }))
  }))

  // 4) Return the response
  return response
})
