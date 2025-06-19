// /server/api/open-pack.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { mintQueue } from '../../utils/queues'
import { prisma as db } from '@/server/prisma'

/* ───────── helpers ───────────────────────────────────────────────────────── */

async function getMe (event) {
  const cookie = getRequestHeader(event, 'cookie') || ''
  try {
    return await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
}

function pickWeighted (opts) {
  const total = opts.reduce((t, o) => t + o.weight, 0)
  const r = Math.random() * total
  let acc = 0
  for (const o of opts) {
    acc += o.weight
    if (r <= acc) return o
  }
  return opts[opts.length - 1]
}

const rngUnder100 = () => Math.random() * 100
const shouldInclude = p => rngUnder100() < p

/* ───────── handler ──────────────────────────────────────────────────────── */

export default defineEventHandler(async (event) => {
  const me = await getMe(event)
  const userId = me.id

  const { id: userPackId } = getQuery(event)
  if (!userPackId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id param' })
  }

  const userPack = await db.userPack.findUnique({
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

  /* ── 1. Build pools & choose cToons ────────────────────────────────────── */
  const poolByRarity = {}
  for (const opt of userPack.pack.ctoonOptions) {
    const c = opt.ctoon
    if (c.quantity !== null) {
      const minted = await db.userCtoon.count({ where: { ctoonId: c.id } })
      if (minted >= c.quantity) continue
    }
    ;(poolByRarity[c.rarity] ||= []).push({ ctoon: c, weight: opt.weight })
  }

  const chosen = []
  for (const rc of userPack.pack.rarityConfigs) {
    const pool = poolByRarity[rc.rarity] || []
    if (!pool.length || !shouldInclude(rc.probabilityPercent)) continue

    const local = [...pool]
    for (let i = 0; i < rc.count && local.length; i++) {
      const pick = pickWeighted(local)
      chosen.push(pick.ctoon)
      local.splice(local.findIndex(o => o.ctoon.id === pick.ctoon.id), 1)
    }
  }
  if (!chosen.length) {
    throw createError({ statusCode: 500, statusMessage: 'Pack yielded no cToons' })
  }

  // how many of each cToon we’re about to mint in THIS opening
  const chosenCounts = {}
  for (const c of chosen) chosenCounts[c.id] = (chosenCounts[c.id] || 0) + 1

  /* ── 2. Mark opened, prune depleted, rebalance weights ─────────────────── */
  await db.$transaction(async (tx) => {
    // mark pack opened
    await tx.userPack.update({
      where: { id: userPackId },
      data:  { opened: true, openedAt: new Date() }
    })

    const packId = userPack.pack.id

    for (const rc of userPack.pack.rarityConfigs) {
      const options = await tx.packCtoonOption.findMany({
        where: { packId, ctoon: { rarity: rc.rarity } },
        include: { ctoon: true }
      })

      const depleted = []
      const remaining = []

      // decide depletion (minted so far + about-to-mint)
      for (const opt of options) {
        const mintedSoFar = await tx.userCtoon.count({ where: { ctoonId: opt.ctoonId } })
        const pending     = chosenCounts[opt.ctoonId] || 0
        const totalAfter  = mintedSoFar + pending
        const isDepleted  = opt.ctoon.quantity !== null && totalAfter >= opt.ctoon.quantity
        ;(isDepleted ? depleted : remaining).push(opt)
      }

      if (depleted.length) {
        await tx.packCtoonOption.deleteMany({
          where: { id: { in: depleted.map(o => o.id) } }
        })
      }

      if (remaining.length) {
        const even  = Math.floor(100 / remaining.length)
        let extra   = 100 - even * remaining.length
        for (const opt of remaining) {
          const newWeight = even + (extra-- > 0 ? 1 : 0)
          if (newWeight !== opt.weight) {
            await tx.packCtoonOption.update({
              where: { id: opt.id },
              data:  { weight: newWeight }
            })
          }
        }
      }

      // If no options left in this rarity, un-list pack and break
      if (!remaining.length) {
        await tx.pack.update({
          where: { id: packId },
          data:  { inCmart: false }
        })
        break
      }
    }
  })

  /* ── 3. Enqueue mints & build response ─────────────────────────────────── */
  for (const c of chosen) {
    await mintQueue.add('mintCtoon', { userId, ctoonId: c.id, isSpecial: true })
  }

  const mintNumbers  = {}
  const inCmartFlags = {}

  for (const c of chosen) {
    const prior = await db.userCtoon.count({ where: { userId, ctoonId: c.id } })
    mintNumbers[c.id] = prior + 1
    const full = await db.ctoon.findUnique({ where: { id: c.id } })
    inCmartFlags[c.id] = full ? full.inCmart : true
  }

  return chosen.map(c => ({
    id:         c.id,
    name:       c.name,
    assetPath:  c.assetPath,
    rarity:     c.rarity,
    mintNumber: mintNumbers[c.id],
    inCmart:    inCmartFlags[c.id]
  }))
})
