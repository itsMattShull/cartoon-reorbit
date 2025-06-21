// /server/api/open-pack.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { mintQueue } from '../../utils/queues'
import { prisma as db } from '@/server/prisma'

/* ───────── helpers ────────────────────────────────────────── */

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

const rngUnder100  = () => Math.random() * 100
const shouldInclude = p => rngUnder100() < p

/* ───────── handler ───────────────────────────────────────── */

export default defineEventHandler(async (event) => {
  /* ── auth & fetch user-pack ─────────────────────────────── */
  const me = await getMe(event)
  const userId = me.id
  const { id: userPackId } = getQuery(event)
  if (!userPackId) throw createError({ statusCode: 400, statusMessage: 'Missing id param' })

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
  if (!userPack || userPack.userId !== userId) throw createError({ statusCode: 404, statusMessage: 'Pack not found' })
  if (userPack.opened) throw createError({ statusCode: 400, statusMessage: 'Pack already opened' })

  /* ── 1. Build pools & choose cToons ─────────────────────── */
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
  if (!chosen.length) throw createError({ statusCode: 500, statusMessage: 'Pack yielded no cToons' })

  /* map of how many of each cToon we’re about to mint */
  const chosenCounts = chosen.reduce((m, c) => {
    m[c.id] = (m[c.id] || 0) + 1
    return m
  }, {})

  /* ── 2. Mark opened, prune depleted, rebalance, update counts ─────────── */
  await db.$transaction(async (tx) => {
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

      const depleted  = []
      const remaining = []

      for (const opt of options) {
        const minted   = await tx.userCtoon.count({ where: { ctoonId: opt.ctoonId } })
        const pending  = chosenCounts[opt.ctoonId] || 0
        const total    = minted + pending
        const isOut    = opt.ctoon.quantity !== null && total >= opt.ctoon.quantity
        ;(isOut ? depleted : remaining).push(opt)
      }

      /* 2-a delete depleted options */
      if (depleted.length > 0) {
        await tx.packCtoonOption.deleteMany({
          where: { id: { in: depleted.map(o => o.id) } }
        })
      }

      // 2-b even out weights for survivors — only if we pruned some options
      if (depleted.length > 0 && remaining.length > 0) {
        const even  = Math.floor(100 / remaining.length)
        let extra   = 100 - even * remaining.length
        for (const opt of remaining) {
          const newW = even + (extra-- > 0 ? 1 : 0)
          if (newW !== opt.weight) {
            await tx.packCtoonOption.update({
              where: { id: opt.id },
              data:  { weight: newW }
            })
          }
        }

        /* 2-c  ➜  NEW: keep PackRarityConfig.count in sync */
        await tx.packRarityConfig.update({
          where: { id: rc.id },
          data:  { count: remaining.length }
        })
      }

      /* 2-d if none left, unlist pack and stop looping */
      if (!remaining.length) {
        await tx.pack.update({ where: { id: packId }, data: { inCmart: false } })
        break
      }
    }
  })

  /* ── 3. queue mints & build response ───────────────────── */
  for (const c of chosen)
    await mintQueue.add('mintCtoon', { userId, ctoonId: c.id, isSpecial: true })

  const mintNumbers  = {}
  const inCmartFlags = {}
  for (const c of chosen) {
    const prior = await db.userCtoon.count({ where: { ctoonId: c.id } })
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
