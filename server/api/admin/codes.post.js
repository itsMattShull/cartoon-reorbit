// server/api/admin/codes.post.js
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event)
  const { code, maxClaims, expiresAt, rewards, prerequisites, backgrounds: topLevelBackgrounds, backgroundIds: topLevelBackgroundIds } = body || {}

  if (!code || typeof code !== 'string') throw createError({ statusCode: 400, statusMessage: 'Code is required.' })
  if (typeof maxClaims !== 'number' || maxClaims < 1) throw createError({ statusCode: 400, statusMessage: 'maxClaims must be a positive integer.' })

  let expiresDate = null
  if (expiresAt) {
    expiresDate = new Date(expiresAt)
    if (isNaN(expiresDate.getTime())) throw createError({ statusCode: 400, statusMessage: 'Invalid expiresAt.' })
  }
  if (!Array.isArray(rewards) || rewards.length === 0) throw createError({ statusCode: 400, statusMessage: 'At least one reward batch is required.' })
  if (prerequisites && !Array.isArray(prerequisites)) throw createError({ statusCode: 400, statusMessage: 'prerequisites must be an array.' })

  const prereqCreates = (prerequisites || []).map((p, i) => {
    if (!p?.ctoonId || typeof p.ctoonId !== 'string') throw createError({ statusCode: 400, statusMessage: `Invalid ctoonId in prerequisites[${i}].` })
    return { ctoonId: p.ctoonId }
  })

  function normalizeBackgroundIds(arr, where = 'rewards[].backgrounds') {
    if (!Array.isArray(arr)) return []
    return arr.map((b, idx) => {
      const id = typeof b === 'string' ? b : b?.backgroundId ?? b?.id
      if (!id || typeof id !== 'string') {
        throw createError({ statusCode: 400, statusMessage: `Invalid background entry at ${where}[${idx}]` })
      }
      return id
    })
  }
  const topLevelIds = [
    ...normalizeBackgroundIds(topLevelBackgrounds, 'backgrounds'),
    ...normalizeBackgroundIds(topLevelBackgroundIds, 'backgroundIds')
  ]

  const rewardCreates = rewards.map((r, i) => {
    const { points } = r || {}
    if (points != null && (typeof points !== 'number' || points < 0)) throw createError({ statusCode: 400, statusMessage: `Invalid points in rewards[${i}].` })

    const usePool = r?.pool && typeof r.pool.uniqueCount === 'number' && r.pool.uniqueCount > 0
    const hasFixed = Array.isArray(r?.ctoons) && r.ctoons.length > 0
    if (usePool && hasFixed) throw createError({ statusCode: 400, statusMessage: `Choose either pooled or fixed cToons in rewards[${i}], not both.` })

    let backgroundIds = [
      ...normalizeBackgroundIds(r?.backgrounds, `rewards[${i}].backgrounds`),
      ...normalizeBackgroundIds(r?.backgroundIds, `rewards[${i}].backgroundIds`)
    ]
    if (backgroundIds.length === 0 && topLevelIds.length > 0) backgroundIds = topLevelIds
    const backgroundCreates = backgroundIds.map(id => ({ backgroundId: id }))

    if (usePool) {
      if (!Array.isArray(r.pool.items) || r.pool.items.length === 0) {
        throw createError({ statusCode: 400, statusMessage: `rewards[${i}].pool.items must be a non-empty array.` })
      }
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
        ...(backgroundCreates.length ? { backgrounds: { create: backgroundCreates } } : {})
      }
    }

    // fixed grants (existing behavior)
    if (!Array.isArray(r?.ctoons)) throw createError({ statusCode: 400, statusMessage: `ctoons must be an array in rewards[${i}].` })
    const ctoonCreates = r.ctoons.map((c, j) => {
      if (!c?.ctoonId || typeof c.ctoonId !== 'string') throw createError({ statusCode: 400, statusMessage: `Invalid ctoonId in rewards[${i}].ctoons[${j}].` })
      if (typeof c.quantity !== 'number' || c.quantity < 1) throw createError({ statusCode: 400, statusMessage: `Invalid quantity in rewards[${i}].ctoons[${j}].` })
      return { ctoonId: c.ctoonId, quantity: c.quantity }
    })
    return {
      points: points ?? 0,
      ctoons: { create: ctoonCreates },
      ...(backgroundCreates.length ? { backgrounds: { create: backgroundCreates } } : {})
    }
  })

  let created
  try {
    created = await prisma.claimCode.create({
      data: {
        code: code.trim(),
        maxClaims,
        expiresAt: expiresDate,
        rewards: { create: rewardCreates },
        prerequisites: { create: prereqCreates }
      }
    })
  } catch (e) {
    if (e.code === 'P2002') throw createError({ statusCode: 400, statusMessage: 'Code already exists.' })
    throw e
  }
  try {
    await logAdminChange(prisma, {
      userId: me.id,
      area: `ClaimCode:${created.code}`,
      key: 'create',
      prevValue: null,
      newValue: { code: created.code, maxClaims: created.maxClaims, expiresAt: created.expiresAt }
    })
  } catch {}
  return created
})
