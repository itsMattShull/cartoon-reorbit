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

// unchanged
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
    if (pool.length === 0 || !shouldIncludeRarity(rc.probabilityPercent)) continue

    // -- NEW: do weighted draws WITHOUT replacement --
    const localPool = [...pool]
    for (let i = 0; i < rc.count && localPool.length > 0; i++) {
      const pick = pickWeighted(localPool)
      chosen.push(pick.ctoon)
      // remove picked item from localPool
      const idx = localPool.findIndex(o => o.ctoon.id === pick.ctoon.id)
      localPool.splice(idx, 1)
    }
    // -- END NEW LOGIC --
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
        continue
      }

      // same mintNumber + first-edition logic as in buy.post.js
      const mintNumber = alreadyMinted + 1
      const isFirstEdition =
        c.initialQuantity === null || mintNumber <= c.initialQuantity

      const uc = await tx.userCtoon.create({
        data: {
          userId:      me.id,
          ctoonId:     c.id,
          mintNumber,
          isFirstEdition
        }
      })
      results.push({ ...c, id: uc.id })
    }

    for (const rc of userPack.pack.rarityConfigs) {
      const options = await tx.packCtoonOption.findMany({
        where: { packId, ctoon: { rarity: rc.rarity } },
        include: { ctoon: true }
      })

      const rarityDepleted = await Promise.all(options.map(async opt => {
        const mintedCount = await tx.userCtoon.count({ where: { ctoonId: opt.ctoon.id } })
        return opt.ctoon.quantity !== null && mintedCount >= opt.ctoon.quantity
      }))

      if (rarityDepleted.every(depleted => depleted)) {
        await tx.pack.update({
          where: { id: packId },
          data: { inCmart: false }
        })
        break
      }
    }

    return results
  })

  return minted.map(c => ({
    id: c.id,
    name: c.name,
    assetPath: c.assetPath,
    rarity: c.rarity
  }))
})
