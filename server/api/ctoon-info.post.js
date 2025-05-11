import { defineEventHandler, readBody } from 'h3'
import { PrismaClient } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const prisma = new PrismaClient()
  const body = await readBody(event)

  if (!body || !Array.isArray(body.assetPaths)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }

  try {
    const ctoons = await prisma.ctoon.findMany({
      where: {
        assetPath: {
          in: body.assetPaths.filter(Boolean)
        }
      },
      select: {
        id: true,
        assetPath: true,
        name: true,
        series: true,
        rarity: true
      }
    })

    return { ctoons: Array.isArray(ctoons) ? ctoons : [] }
  } catch (error) {
    console.error('[API] Failed to fetch cToon info:', error)
    throw createError({ statusCode: 500, statusMessage: 'Internal server error' })
  }
})
