// server/api/cmart/open-pack.get.js
//
// Opens a sealed pack that the user just bought and returns the
// randomly-selected cToons that were inside.
//
//   • query ?id=<userPackId>
//   • user must own this UserPack and it must still be unopened
//   • obey PackRarityConfig counts and PackCtoonOption weights
//   • respect cToon.quantity (print-run) when selecting
//   • creates UserCtoon rows ± mints, marks UserPack.opened = true
//   • returns [{ id,name,assetPath,rarity }] for the UI reveal
//
// Assumes the following tables exist (names from earlier schema):
//   User        (id)
//   UserPack    (id,userId,packId,opened:Boolean)
//   Pack        (id,name)
//   PackRarityConfig   (packId,rarity,count)
//   PackCtoonOption    (packId,ctoonId,weight)
//   Ctoon              (id,name,rarity,assetPath,quantity)  // quantity null = unlimited
//   UserCtoon          (...)

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

  // Load the sealed UserPack + its Pack config
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
  // Build in-memory pools, skipping sold-out cToons
  const poolByRarity = {}
  for (const opt of userPack.pack.ctoonOptions) {
    const c = opt.ctoon
    if (c.quantity !== null && c.quantity <= 0) continue
    if (!poolByRarity[c.rarity]) poolByRarity[c.rarity] = []
    poolByRarity[c.rarity].push({ ctoon: c, weight: opt.weight })
  }

  // Select cToons
  const chosen = []
  for (const rc of userPack.pack.rarityConfigs) {
    const pool = poolByRarity[rc.rarity] || []
    if (pool.length === 0) continue
    for (let i = 0; i < rc.count; i++) {
      const pick = pickWeighted(pool)
      chosen.push(pick.ctoon)
      if (pick.ctoon.quantity !== null) {
        pick.ctoon.quantity--
        if (pick.ctoon.quantity === 0) {
          const idx = pool.indexOf(pick)
          if (idx !== -1) pool.splice(idx, 1)
        }
      }
    }
  }
  if (chosen.length === 0) {
    throw createError({ statusCode: 500, statusMessage: 'Pack yielded no cToons' })
  }

  // Persist everything in one transaction
  const minted = await db().$transaction(async (tx) => {
    // Mark the pack opened
    await tx.userPack.update({
      where: { id: userPackId },
      data: { opened: true, openedAt: new Date() }
    })

    const results = []
    for (const c of chosen) {
      // Decrement print-run if limited
      if (c.quantity !== null) {
        const updated = await tx.ctoon.update({
          where: { id: c.id },
          data: { quantity: { decrement: 1 } },
          select: { quantity: true }
        })
        if (updated.quantity === 0) {
          // Remove sold-out option
          await tx.packCtoonOption.deleteMany({
            where: { packId, ctoonId: c.id }
          })
        }
      }

      // Mint the cToon to the user
      const alreadyMinted = await tx.userCtoon.count({
        where: { ctoonId: c.id }
      })
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

    // Remove any empty rarity configs
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

  // Return the freshly minted cToons to the client
  return minted.map(c => ({
    id:       c.id,
    name:     c.name,
    assetPath:c.assetPath,
    rarity:   c.rarity
  }))
})
