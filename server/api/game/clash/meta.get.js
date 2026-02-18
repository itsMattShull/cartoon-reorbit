import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

const DEFAULT_DAYS = 30
const VALID_DAYS = new Set([7, 14, 30, 60, 90])
const VALID_FILTERS = new Set(['all', 'tournament', 'non_tournament'])
const VALID_SORTS = new Set(['winPct', 'wins', 'games'])

function parseDays(value) {
  const parsed = Number.parseInt(value, 10)
  return VALID_DAYS.has(parsed) ? parsed : DEFAULT_DAYS
}

function parseNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const cards = Array.isArray(snapshot.cards) ? snapshot.cards : []
  const normalized = cards
    .map(card => ({
      ctoonId: card.ctoonId || card.id || null,
      name: card.name || null,
      assetPath: card.assetPath || null,
      gtoonType: card.gtoonType || null,
      cost: Number.isFinite(card.cost) ? card.cost : null,
      power: Number.isFinite(card.power) ? card.power : null,
      quantity: Number.isFinite(card.quantity) ? card.quantity : 1
    }))
    .filter(card => card.ctoonId)
    .sort((a, b) => (b.quantity - a.quantity) || String(a.name || '').localeCompare(String(b.name || '')))

  if (!normalized.length) return null

  return {
    deckId: snapshot.deckId || null,
    deckName: snapshot.deckName || null,
    totalCards: Number.isFinite(snapshot.totalCards) ? snapshot.totalCards : normalized.reduce((sum, c) => sum + c.quantity, 0),
    cards: normalized
  }
}

function deckKey(cards) {
  return cards
    .map(card => `${card.ctoonId}:${card.quantity}`)
    .sort()
    .join('|')
}

function pickMostCommonName(nameCounts) {
  if (!nameCounts) return null
  let best = null
  let bestCount = 0
  for (const [name, count] of nameCounts.entries()) {
    if (count > bestCount) {
      best = name
      bestCount = count
    }
  }
  return best
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const days = parseDays(query.days)
  const minGames = Math.max(0, parseNumber(query.minGames, 3))
  const limit = Math.min(100, Math.max(5, parseNumber(query.limit, 25)))
  const filter = VALID_FILTERS.has(query.filter) ? query.filter : 'all'
  const sort = VALID_SORTS.has(query.sort) ? query.sort : 'winPct'

  const since = new Date()
  since.setDate(since.getDate() - days)

  const where = {
    player2UserId: { not: null },
    endedAt: { gte: since }
  }
  if (filter === 'tournament') where.isTournament = true
  if (filter === 'non_tournament') where.isTournament = false

  const games = await prisma.clashGame.findMany({
    where,
    select: {
      player1UserId: true,
      player2UserId: true,
      winnerUserId: true,
      outcome: true,
      player1DeckSnapshot: true,
      player2DeckSnapshot: true
    }
  })

  const deckStats = new Map()
  const winningCards = new Map()
  const ctoonIds = new Set()
  let totalGames = 0
  let totalWins = 0

  const ensureDeck = (key, snapshot) => {
    if (!deckStats.has(key)) {
      deckStats.set(key, {
        deckKey: key,
        deckName: snapshot.deckName || null,
        deckId: snapshot.deckId || null,
        cards: snapshot.cards,
        games: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        nameCounts: new Map()
      })
    }
    const entry = deckStats.get(key)
    if (snapshot.deckName) {
      entry.nameCounts.set(snapshot.deckName, (entry.nameCounts.get(snapshot.deckName) || 0) + 1)
    }
    return entry
  }

  for (const game of games) {
    if (String(game.outcome || '').toLowerCase() === 'incomplete') continue
    const deck1 = normalizeSnapshot(game.player1DeckSnapshot)
    const deck2 = normalizeSnapshot(game.player2DeckSnapshot)
    if (!deck1 || !deck2) continue

    for (const card of deck1.cards) ctoonIds.add(card.ctoonId)
    for (const card of deck2.cards) ctoonIds.add(card.ctoonId)

    totalGames += 1
    const winnerId = game.winnerUserId
    const tie = String(game.outcome || '').toLowerCase() === 'tie'
    const hasWinner = Boolean(winnerId) && !tie

    const key1 = deckKey(deck1.cards)
    const key2 = deckKey(deck2.cards)
    const d1 = ensureDeck(key1, deck1)
    const d2 = ensureDeck(key2, deck2)

    d1.games += 1
    d2.games += 1

    if (tie) {
      d1.ties += 1
      d2.ties += 1
    } else if (hasWinner) {
      if (winnerId === game.player1UserId) {
        d1.wins += 1
        d2.losses += 1
      } else if (winnerId === game.player2UserId) {
        d2.wins += 1
        d1.losses += 1
      }
      totalWins += 1
    }

    if (hasWinner) {
      const winningDeck = winnerId === game.player1UserId ? deck1 : deck2
      for (const card of winningDeck.cards) {
        const entry = winningCards.get(card.ctoonId) || {
          ctoonId: card.ctoonId,
          name: card.name || null,
          gtoonType: card.gtoonType || null,
          deckWins: 0,
          copies: 0
        }
        entry.deckWins += 1
        entry.copies += card.quantity
        if (!entry.name && card.name) entry.name = card.name
        if (!entry.gtoonType && card.gtoonType) entry.gtoonType = card.gtoonType
        winningCards.set(card.ctoonId, entry)
      }
    }
  }

  const ctoonMeta = new Map()
  if (ctoonIds.size) {
    const ctoons = await prisma.ctoon.findMany({
      where: { id: { in: Array.from(ctoonIds) } },
      select: { id: true, name: true, assetPath: true, gtoonType: true, cost: true, power: true }
    })
    for (const ctoon of ctoons) {
      ctoonMeta.set(ctoon.id, ctoon)
    }
  }

  const decks = Array.from(deckStats.values())
    .map(entry => {
      const winPct = entry.games > 0
        ? ((entry.wins + entry.ties * 0.5) / entry.games) * 100
        : 0
      const cards = entry.cards.map(card => {
        const meta = ctoonMeta.get(card.ctoonId)
        return {
          ...card,
          name: card.name || meta?.name || null,
          gtoonType: card.gtoonType || meta?.gtoonType || null,
          cost: Number.isFinite(card.cost) ? card.cost : (Number.isFinite(meta?.cost) ? meta.cost : null),
          power: Number.isFinite(card.power) ? card.power : (Number.isFinite(meta?.power) ? meta.power : null),
          assetPath: card.assetPath || meta?.assetPath || null
        }
      })
      return {
        deckKey: entry.deckKey,
        deckName: pickMostCommonName(entry.nameCounts) || entry.deckName || 'Unnamed Deck',
        deckId: entry.deckId,
        games: entry.games,
        wins: entry.wins,
        losses: entry.losses,
        ties: entry.ties,
        winPct,
        sharePct: totalGames > 0 ? (entry.games / totalGames) * 100 : 0,
        cards
      }
    })
    .filter(entry => entry.games >= minGames)

  const sorters = {
    winPct: (a, b) => (b.winPct - a.winPct) || (b.wins - a.wins) || (b.games - a.games),
    wins: (a, b) => (b.wins - a.wins) || (b.winPct - a.winPct) || (b.games - a.games),
    games: (a, b) => (b.games - a.games) || (b.winPct - a.winPct) || (b.wins - a.wins)
  }

  const sortedDecks = decks.sort(sorters[sort]).slice(0, limit)

  const winningCtoons = Array.from(winningCards.values())
    .map(entry => ({
      ctoonId: entry.ctoonId,
      name: entry.name || 'Unknown',
      gtoonType: entry.gtoonType,
      deckWins: entry.deckWins,
      copies: entry.copies,
      winSharePct: totalWins > 0 ? (entry.deckWins / totalWins) * 100 : 0
    }))
    .sort((a, b) => (b.deckWins - a.deckWins) || (b.copies - a.copies))
    .slice(0, 10)

  return {
    days,
    filter,
    sort,
    minGames,
    totalGames,
    totalWins,
    totalDecks: decks.length,
    decks: sortedDecks,
    winningCtoons
  }
})
