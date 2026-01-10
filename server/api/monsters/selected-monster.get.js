// server/api/monsters/selected-monster.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // Authenticate user
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // Find the user's selected monster
  let monster = await db.userMonster.findFirst({
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
      customName: true,
      hp: true,
      maxHealth: true,
      atk: true,
      def: true,
      lastInteractionAt: true,
      createdAt: true,
    }
  })

  if (!monster) {
    return { monster: null }
  }

  if (!monster.lastInteractionAt) {
    monster = await db.userMonster.update({
      where: { id: monster.id },
      data: { lastInteractionAt: new Date() },
      select: {
        id: true,
        userId: true,
        mappingId: true,
        configId: true,
        speciesIndex: true,
        name: true,
        monsterType: true,
        rarity: true,
        customName: true,
        hp: true,
        maxHealth: true,
        atk: true,
        def: true,
        lastInteractionAt: true,
        createdAt: true,
      }
    })
  }

  // Apply inactivity decay before returning the monster
  const config = await db.barcodeGameConfig.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    select: { monsterInactivityDecayHours: true }
  })
  const decayHours = Number(config?.monsterInactivityDecayHours ?? 48)
  if (Number.isFinite(decayHours) && decayHours > 0 && monster?.maxHealth != null && monster?.hp != null) {
    const last = monster.lastInteractionAt || monster.createdAt
    const lastTs = last ? new Date(last).getTime() : Date.now()
    const elapsedMs = Math.max(0, Date.now() - lastTs)
    const windowMs = decayHours * 60 * 60 * 1000
    const ratio = windowMs > 0 ? Math.min(1, Math.max(0, elapsedMs / windowMs)) : 1
    const targetHp = Math.max(0, Math.round(Number(monster.maxHealth) * (1 - ratio)))
    const nextHp = Math.min(Number(monster.hp), targetHp)
    if (Number.isFinite(nextHp) && nextHp !== Number(monster.hp)) {
      monster = await db.userMonster.update({
        where: { id: monster.id },
        data: { hp: nextHp },
        select: {
          id: true,
          userId: true,
          mappingId: true,
          configId: true,
          speciesIndex: true,
          name: true,
          monsterType: true,
          rarity: true,
          customName: true,
          hp: true,
          maxHealth: true,
          atk: true,
          def: true,
          lastInteractionAt: true,
          createdAt: true,
        }
      })
    }
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
