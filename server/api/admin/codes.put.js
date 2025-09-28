// server/api/admin/codes.put.js
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const { code, maxClaims, expiresAt, rewards, prerequisites } = await readBody(event)

  if (!code || typeof code !== 'string') throw createError({ statusCode: 400, statusMessage: 'Code is required.' })
  if (typeof maxClaims !== 'number' || maxClaims < 1) throw createError({ statusCode: 400, statusMessage: 'maxClaims must be >= 1.' })

  let expiresDate = null
  if (expiresAt) {
    const dt = new Date(expiresAt)
    if (isNaN(dt.getTime())) throw createError({ statusCode: 400, statusMessage: 'Invalid expiresAt.' })
    expiresDate = dt
  }
  if (!Array.isArray(rewards) || rewards.length === 0) throw createError({ statusCode: 400, statusMessage: 'At least one reward batch is required.' })
  if (prerequisites && !Array.isArray(prerequisites)) throw createError({ statusCode: 400, statusMessage: 'prerequisites must be an array.' })

  const existing = await prisma.claimCode.findUnique({ where: { code }, select: { id: true } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Code not found.' })
  const codeId = existing.id

  function normBgIds(arr, where) {
    if (!Array.isArray(arr)) return []
    return arr.map((b, idx) => {
      const id = typeof b === 'string' ? b : b?.backgroundId ?? b?.id
      if (!id || typeof id !== 'string') throw createError({ statusCode: 400, statusMessage: `Invalid backgroundId in ${where}[${idx}]` })
      return id
    })
  }

  const rewardCreates = rewards.map((r, i) => {
    const { points } = r || {}
    if (points != null && (typeof points !== 'number' || points < 0)) throw createError({ statusCode: 400, statusMessage: `Invalid points in rewards[${i}].` })

    const usePool = r?.pool && typeof r.pool.uniqueCount === 'number' && r.pool.uniqueCount > 0
    const hasFixed = Array.isArray(r?.ctoons) && r.ctoons.length > 0
    if (usePool && hasFixed) throw createError({ statusCode: 400, statusMessage: `Choose either pooled or fixed cToons in rewards[${i}].` })

    const bgIds = [
      ...normBgIds(r?.backgrounds, `rewards[${i}].backgrounds`),
      ...normBgIds(r?.backgroundIds, `rewards[${i}].backgroundIds`)
    ]
    const bgCreates = bgIds.map(id => ({ backgroundId: id }))

    if (usePool) {
      if (!Array.isArray(r.pool.items) || r.pool.items.length === 0) throw createError({ statusCode: 400, statusMessage: `rewards[${i}].pool.items must be a non-empty array.` })
      const poolCreates = r.pool.items.map((it, j) => {
        const id = it?.ctoonId
        const weight = Number(it?.weight ?? 1)
        if (!id || typeof id !== 'string') throw createError({ statusCode: 400, statusMessage: `Invalid ctoonId in rewards[${i}].pool.items[${j}].` })
        if (!Number.isFinite(weight) || weight < 1) throw createError({ statusCode: 400, statusMessage: `Invalid weight in rewards[${i}].pool.items[${j}].` })
        return { ctoonId: id, weight }
      })
      return {
        points: points ?? 0,
        pooledUniqueCount: r.pool.uniqueCount,
        poolCtoons: { create: poolCreates },
        ...(bgCreates.length ? { backgrounds: { create: bgCreates } } : {})
      }
    }

    if (!Array.isArray(r?.ctoons)) throw createError({ statusCode: 400, statusMessage: `ctoons must be an array in rewards[${i}].` })
    const fixedCreates = r.ctoons.map((c, j) => {
      if (!c?.ctoonId || typeof c.ctoonId !== 'string') throw createError({ statusCode: 400, statusMessage: `Invalid ctoonId in rewards[${i}].ctoons[${j}].` })
      if (typeof c.quantity !== 'number' || c.quantity < 1) throw createError({ statusCode: 400, statusMessage: `Invalid quantity in rewards[${i}].ctoons[${j}].` })
      return { ctoonId: c.ctoonId, quantity: c.quantity }
    })
    return {
      points: points ?? 0,
      ctoons: { create: fixedCreates },
      ...(bgCreates.length ? { backgrounds: { create: bgCreates } } : {})
    }
  })

  const prereqCreates = (prerequisites || []).map((p, i) => {
    if (!p?.ctoonId || typeof p.ctoonId !== 'string') throw createError({ statusCode: 400, statusMessage: `Invalid ctoonId in prerequisites[${i}].` })
    return { ctoonId: p.ctoonId }
  })

  const results = await prisma.$transaction([
    prisma.rewardCtoon.deleteMany({ where: { reward: { codeId } } }),
    prisma.rewardCtoonPool.deleteMany({ where: { reward: { codeId } } }), // NEW
    prisma.rewardBackground.deleteMany({ where: { reward: { codeId } } }),
    prisma.claimCodeReward.deleteMany({ where: { codeId } }),
    prisma.claimCodePrerequisite.deleteMany({ where: { codeId } }),
    prisma.claimCode.update({
      where: { code },
      data: { maxClaims, expiresAt: expiresDate, rewards: { create: rewardCreates }, prerequisites: { create: prereqCreates } }
    })
  ])

  return results[results.length - 1]
})
