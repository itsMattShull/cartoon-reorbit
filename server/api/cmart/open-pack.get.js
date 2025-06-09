// server/api/open-pack.get.js
import { PrismaClient } from '@prisma/client'
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { mintQueue } from '../../utils/queues'

let prisma
function db() {
  if (!prisma) prisma = new PrismaClient()
  return prisma
}

async function getMe(event) {
  const cookie = getRequestHeader(event, 'cookie') || ''
  try {
    return await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
}

function pickWeighted(options) {
  const total = options.reduce((sum, o) => sum + o.weight, 0)
  const r = Math.random() * total
  let acc = 0
  for (const o of options) {
    acc += o.weight
    if (r <= acc) return o
  }
  return options[options.length - 1]
}

function shouldIncludeRarity(probabilityPercent) {
  return Math.random() * 100 < probabilityPercent
}

export default defineEventHandler(async (event) => {
  const me = await getMe(event)
  const userId = me.id
  const { id: userPackId } = getQuery(event)
  if (!userPackId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id param' })
  }

  const userPack = await db().userPack.findUnique({
    where: { id: userPackId },
    include: {
      pack: {
        include: {
          rarityConfigs: true,
          ctoonOptions: { include: { ctoon: true } }
        }
      }
    }
  })
  if (!userPack || userPack.userId !== userId) {
    throw createError({ statusCode: 404, statusMessage: 'Pack not found' })
  }
  if (userPack.opened) {
    throw createError({ statusCode: 400, statusMessage: 'Pack already opened' })
  }

  // Build pools and select cToons
  const poolByRarity = {}
  for (const opt of userPack.pack.ctoonOptions) {
    const c = opt.ctoon
    if (c.quantity !== null) {
      const minted = await db().userCtoon.count({ where: { ctoonId: c.id } })
      if (minted >= c.quantity) continue
    }
    if (!poolByRarity[c.rarity]) poolByRarity[c.rarity] = []
    poolByRarity[c.rarity].push({ ctoon: c, weight: opt.weight })
  }

  const chosen = []
  for (const rc of userPack.pack.rarityConfigs) {
    const pool = poolByRarity[rc.rarity] || []
    if (pool.length === 0 || !shouldIncludeRarity(rc.probabilityPercent)) continue
    const localPool = [...pool]
    for (let i = 0; i < rc.count && localPool.length > 0; i++) {
      const pick = pickWeighted(localPool)
      chosen.push(pick.ctoon)
      const idx = localPool.findIndex(o => o.ctoon.id === pick.ctoon.id)
      localPool.splice(idx, 1)
    }
  }

  if (chosen.length === 0) {
    throw createError({ statusCode: 500, statusMessage: 'Pack yielded no cToons' })
  }

  // Mark pack opened and handle depletion
  await db().$transaction(async (tx) => {
    await tx.userPack.update({
      where: { id: userPackId },
      data: { opened: true, openedAt: new Date() }
    })

    const packId = userPack.pack.id
    for (const rc of userPack.pack.rarityConfigs) {
      const options = await tx.packCtoonOption.findMany({
        where: { packId, ctoon: { rarity: rc.rarity } }
      })

      const rarityDepleted = await Promise.all(
        options.map(async opt => {
          const count = await tx.userCtoon.count({ where: { ctoonId: opt.ctoonId } })
          return opt.ctoon.quantity !== null && count >= opt.ctoon.quantity
        })
      )

      if (rarityDepleted.every(depleted => depleted)) {
        await tx.pack.update({
          where: { id: packId },
          data: { inCmart: false }
        })
        break
      }
    }
  })

  // Enqueue a mintCtoon job for each selected cToon
  for (const c of chosen) {
    await mintQueue.add('mintCtoon', { userId, ctoonId: c.id })
  }

  // Return the selected cToons in the same shape as before
  return chosen.map(c => ({
    id: c.id,
    name: c.name,
    assetPath: c.assetPath,
    rarity: c.rarity
  }))
})
