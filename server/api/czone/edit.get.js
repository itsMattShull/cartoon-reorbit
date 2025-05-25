import { promises as fs } from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const prisma = new PrismaClient()
  const user = event.context.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // Get owned cToons
  const owned = await prisma.userCtoon.findMany({
    where: { userId: user.id },
    include: { ctoon: true }
  })

  const ctoons = owned.map(uc => ({
    id: uc.id,
    name: uc.ctoon.name,
    series: uc.ctoon.series,
    rarity: uc.ctoon.rarity,
    set: uc.ctoon.set,
    isFirstEdition: uc.ctoon.isFirstEdition,
    releaseDate: uc.ctoon.releaseDate,
    assetPath: uc.ctoon.assetPath
  }))

  // Get backgrounds from public/backgrounds directory
  const backgroundsDir = path.join(process.cwd(), 'public', 'backgrounds')
  const files = await fs.readdir(backgroundsDir)
  const backgrounds = files.filter(file =>
    /\.(png|jpe?g|gif|webp)$/i.test(file)
  )

  // Get existing cZone
  const zone = await prisma.cZone.findFirst({
    where: { userId: user.id }
  })

  return {
    ctoons,
    backgrounds,
    layout: zone?.layoutData || [],
    background: zone?.background || 'IMG_3433.GIF'
  }
})