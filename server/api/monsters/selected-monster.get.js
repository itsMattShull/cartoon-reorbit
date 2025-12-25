// server/api/monsters/selected-monster.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // Authenticate user
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // Find the user's selected monster
  const monster = await db.userMonster.findFirst({
    where: { userId: String(me.id), lastSelected: true },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      userId: true,
      mappingId: true,
      configId: true,
      speciesIndex: true,
      name: true,
      monsterType: true,
      rarity: true,
      hp: true,
      maxHealth: true,
      atk: true,
      def: true,
      createdAt: true,
    }
  })

  if (!monster) {
    return { monster: null }
  }

  // Look up species template for image paths
  const species = await db.speciesBaseStats.findUnique({
    where: { configId_speciesIndex: { configId: monster.configId, speciesIndex: monster.speciesIndex } },
    select: {
      name: true,
      type: true,
      rarity: true,
      walkingImagePath: true,
      standingStillImagePath: true,
      jumpingImagePath: true,
    }
  })

  return {
    monster,
    species,
    src: species ? {
      walk: species.walkingImagePath || null,
      idle: species.standingStillImagePath || null,
      jump: species.jumpingImagePath || null,
    } : { walk: null, idle: null, jump: null }
  }
})
