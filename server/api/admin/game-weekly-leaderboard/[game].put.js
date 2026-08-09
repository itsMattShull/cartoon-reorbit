// PUT /api/admin/game-weekly-leaderboard/[game] — create or update the one active weekly
// prize config for a game.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { isSupportedGame } from '@/server/utils/gameWeeklyLeaderboardGames'

const MAX_FALLBACK_POINTS = 1_000_000

function isInt(v) { return Number.isInteger(v) }

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const { game } = event.context.params
  if (!isSupportedGame(game)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported game' })
  }

  const body = await readBody(event)
  const ctoonId = String(body?.ctoonId || '')
  const fallbackPoints = Number(body?.fallbackPoints)
  const dayOfWeek = Number(body?.dayOfWeek)
  const hour = Number(body?.hour)
  const minute = Number(body?.minute)
  const isActive = body?.isActive !== false

  if (!ctoonId) throw createError({ statusCode: 400, statusMessage: 'ctoonId is required' })
  if (!isInt(fallbackPoints) || fallbackPoints < 0 || fallbackPoints > MAX_FALLBACK_POINTS) {
    throw createError({ statusCode: 400, statusMessage: `fallbackPoints must be an integer between 0 and ${MAX_FALLBACK_POINTS}` })
  }
  if (!isInt(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    throw createError({ statusCode: 400, statusMessage: 'dayOfWeek must be an integer 0-6' })
  }
  if (!isInt(hour) || hour < 0 || hour > 23) {
    throw createError({ statusCode: 400, statusMessage: 'hour must be an integer 0-23' })
  }
  if (!isInt(minute) || minute < 0 || minute > 59) {
    throw createError({ statusCode: 400, statusMessage: 'minute must be an integer 0-59' })
  }

  const ctoon = await prisma.ctoon.findUnique({ where: { id: ctoonId }, select: { id: true, quantity: true, totalMinted: true } })
  if (!ctoon) throw createError({ statusCode: 400, statusMessage: 'cToon not found' })

  const soldOut = ctoon.quantity !== null && ctoon.totalMinted >= ctoon.quantity
  if (soldOut) {
    throw createError({ statusCode: 400, statusMessage: 'This cToon has no remaining quantity to mint — pick a different prize cToon or raise its quantity first' })
  }

  const config = await prisma.gameWeeklyPrizeConfig.upsert({
    where: { game },
    create: { game, ctoonId, fallbackPoints, dayOfWeek, hour, minute, isActive },
    update: { ctoonId, fallbackPoints, dayOfWeek, hour, minute, isActive },
    include: { ctoon: { select: { id: true, name: true, assetPath: true, rarity: true, quantity: true, totalMinted: true } } }
  })

  return config
})
