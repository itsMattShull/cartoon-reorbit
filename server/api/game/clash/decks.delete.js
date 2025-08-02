// File: server/api/game/clash/decks.delete.js
import { defineEventHandler, getQuery, createError, getRequestHeader } from 'h3'
import { prisma } from '~/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Authenticate user
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

  // 2) Parse & validate deck ID from query string
  const { id } = getQuery(event)
  if (!id || typeof id !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Must provide a deck `id` to delete'
    })
  }

  // 3) Ensure the deck exists and belongs to this user
  const deck = await prisma.clashDeck.findUnique({ where: { id } })
  if (!deck || deck.userId !== userId) {
    throw createError({ statusCode: 404, statusMessage: 'Deck not found' })
  }

  // 4) Delete its cards and then the deck
  await prisma.clashDeckCard.deleteMany({ where: { deckId: id } })
  await prisma.clashDeck.delete({ where: { id } })

  // 5) Return success
  return { success: true }
})
