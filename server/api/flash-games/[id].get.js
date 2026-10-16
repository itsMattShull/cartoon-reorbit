// server/api/flash-games/[id].get.js — single game for pages/newsite/flash-games/[id].vue's
// RufflePlayer. Active-only, same as the listing — a direct link to a since-deactivated game
// 404s rather than silently still playing it.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  const game = await db.flashGame.findUnique({
    where: { id },
    select: { id: true, title: true, description: true, swfPath: true, active: true },
  })
  if (!game || !game.active) throw createError({ statusCode: 404, statusMessage: 'Game not found' })

  return { game }
})
