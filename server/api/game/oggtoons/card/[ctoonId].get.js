// GET /api/game/oggtoons/card/:ctoonId — the printed ("default") properties of an Original gToon, for the
// in-game properties dialog (right-click / long-press on a card). These are the card's own saved
// attributes — never anything about a live match — so it is safe to ask for any gToon a player can see.
import { defineEventHandler, createError, setHeader, getRouterParam } from 'h3'
import { prisma } from '@/server/prisma'
import { OG_GTOON_DISPLAY_SELECT, ogGtoonDisplay } from '~/server/utils/ogGtoonDisplay'
import { powerDescriptionFor, describeEffects } from '~/server/utils/ogGtoonPowerCatalog'

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const id = String(getRouterParam(event, 'ctoonId') || '')
  if (!id || id.length > 64) {
    throw createError({ statusCode: 400, statusMessage: 'Bad card id' })
  }

  const c = await prisma.ctoon.findFirst({
    where: { id, isOgGtoon: true },
    select: {
      id: true, name: true, assetPath: true, characters: true,
      gtoonType1: true, gtoonType2: true, gtoonType3: true, gtoonGroup: true,
      isSlamGtoon: true, gtoonEffect: true,
      ...OG_GTOON_DISPLAY_SELECT
    }
  })
  if (!c) throw createError({ statusCode: 404, statusMessage: 'gToon not found' })

  setHeader(event, 'Cache-Control', 'private, max-age=300')
  return {
    id: c.id,
    name: c.name,
    assetPath: c.assetPath,
    characters: Array.isArray(c.characters) ? c.characters : [],
    types: [c.gtoonType1, c.gtoonType2, c.gtoonType3].filter(Boolean),
    group: c.gtoonGroup ?? null,
    power: {
      isSlam: !!c.isSlamGtoon,
      description: c.isSlamGtoon ? (powerDescriptionFor(c.gtoonEffect) || describeEffects(c.gtoonEffect)) : null
    },
    ...ogGtoonDisplay(c)
  }
})
