// server/api/cmart/open-pack.get.js
import { PrismaClient } from '@prisma/client'
import {
  defineEventHandler,
  getQuery,
  getRequestHeader,
  createError
} from 'h3'

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

export default defineEventHandler(async (event) => {
  const me = await getMe(event)
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
  if (!userPack || userPack.userId !== me.id) {
    throw createError({ statusCode: 404, statusMessage: 'Pack not found' })
  }
  if (userPack.opened) {
    throw createError({ statusCode: 400, statusMessage: 'Pack already opened' })
  }

  const packId = userPack.pack.id
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
    if (pool.length === 0) continue
    for (let i = 0; i < rc.count; i++) {
      const pick = pickWeighted(pool)
      chosen.push(pick.ctoon)
    }
  }
  if (chosen.length === 0) {
    throw createError({ statusCode: 500, statusMessage: 'Pack yielded no cToons' })
  }

  const minted = await db().$transaction(async (tx) => {
    await tx.userPack.update({
      where: { id: userPackId },
      data: { opened: true, openedAt: new Date() }
    })

    const results = []
    for (const c of chosen) {
      const alreadyMinted = await tx.userCtoon.count({
        where: { ctoonId: c.id }
      })

      if (c.quantity !== null && alreadyMinted >= c.quantity) {
        continue  // skip minting if limit is reached
      }

      const uc = await tx.userCtoon.create({
        data: {
          userId: me.id,
          ctoonId: c.id,
          isFirstEdition: alreadyMinted === 0,
          mintNumber: alreadyMinted + 1
        }
      })
      results.push({ ...c, id: uc.id })
    }

    for (const rc of userPack.pack.rarityConfigs) {
      const remaining = await tx.packCtoonOption.count({
        where: { packId, ctoon: { rarity: rc.rarity } }
      })
      if (remaining === 0) {
        await tx.packRarityConfig.deleteMany({
          where: { packId, rarity: rc.rarity }
        })
      }
    }

    return results
  })

  return minted.map(c => ({
    id:       c.id,
    name:     c.name,
    assetPath:c.assetPath,
    rarity:   c.rarity
  }))
})
