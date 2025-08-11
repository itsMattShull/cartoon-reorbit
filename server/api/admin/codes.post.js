// server/api/admin/codes.post.js

import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // ── 1. Admin check ──────────────────────────────────────────────────────
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  // ── 2. Parse & validate input ───────────────────────────────────────────
  const body = await readBody(event)
  const {
    code,
    maxClaims,
    expiresAt,
    rewards,
    prerequisites,
    // possible top-level fallbacks:
    backgrounds: topLevelBackgrounds,
    backgroundIds: topLevelBackgroundIds
  } = body || {}

  // validate prerequisites
  if (prerequisites && !Array.isArray(prerequisites)) {
    throw createError({ statusCode: 400, statusMessage: 'prerequisites must be an array.' })
  }
  const prereqCreates = (prerequisites || []).map((p, i) => {
    if (!p?.ctoonId || typeof p.ctoonId !== 'string') {
      throw createError({ statusCode: 400, statusMessage: `Invalid ctoonId in prerequisites[${i}].` })
    }
    return { ctoonId: p.ctoonId }
  })

  if (!code || typeof code !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Code is required.' })
  }
  if (typeof maxClaims !== 'number' || maxClaims < 1) {
    throw createError({ statusCode: 400, statusMessage: 'maxClaims must be a positive integer.' })
  }

  let expiresDate = null
  if (expiresAt) {
    expiresDate = new Date(expiresAt)
    if (isNaN(expiresDate.getTime())) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid expiresAt.' })
    }
  }

  if (!Array.isArray(rewards) || rewards.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one reward batch is required.' })
  }

  // helper: normalize an array of background entries into ids
  function normalizeBackgroundIds(arr, where = 'rewards[].backgrounds') {
    if (!Array.isArray(arr)) return []
    const ids = []
    arr.forEach((b, idx) => {
      const id =
        typeof b === 'string' ? b :
        (b && typeof b.backgroundId === 'string') ? b.backgroundId :
        (b && typeof b.id === 'string') ? b.id :
        null
      if (!id) {
        throw createError({
          statusCode: 400,
          statusMessage: `Invalid background entry at ${where}[${idx}]`
        })
      }
      ids.push(id)
    })
    return ids
  }

  const topLevelIds = [
    ...normalizeBackgroundIds(topLevelBackgrounds, 'backgrounds'),
    ...normalizeBackgroundIds(topLevelBackgroundIds, 'backgroundIds')
  ]

  // ── 3. Build nested creation payload for ClaimCodeReward + RewardCtoon ──
  const rewardCreates = rewards.map((r, i) => {
    const { points, ctoons } = r || {}

    if (points != null && (typeof points !== 'number' || points < 0)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid points in rewards[${i}].` })
    }
    if (!Array.isArray(ctoons)) {
      throw createError({ statusCode: 400, statusMessage: `ctoons must be an array in rewards[${i}].` })
    }

    const ctoonCreates = ctoons.map((c, j) => {
      if (!c?.ctoonId || typeof c.ctoonId !== 'string') {
        throw createError({ statusCode: 400, statusMessage: `Invalid ctoonId in rewards[${i}].ctoons[${j}].` })
      }
      if (typeof c.quantity !== 'number' || c.quantity < 1) {
        throw createError({ statusCode: 400, statusMessage: `Invalid quantity in rewards[${i}].ctoons[${j}].` })
      }
      return { ctoonId: c.ctoonId, quantity: c.quantity }
    })

    // backgrounds can be per-reward OR (fallback) top-level
    let perRewardIds = [
      ...normalizeBackgroundIds(r?.backgrounds, `rewards[${i}].backgrounds`),
      ...normalizeBackgroundIds(r?.backgroundIds, `rewards[${i}].backgroundIds`)
    ]

    if (perRewardIds.length === 0 && topLevelIds.length > 0) {
      // fallback: use top-level for this reward if none provided at reward level
      perRewardIds = topLevelIds
    }

    const backgroundCreates = perRewardIds.map(id => ({ backgroundId: id }))

    // dev visibility
    // eslint-disable-next-line no-console
    console.log(`[codes.post] reward[${i}] -> backgrounds:`, backgroundCreates.length)

    return {
      points: points ?? 0,
      ctoons: { create: ctoonCreates },
      ...(backgroundCreates.length ? { backgrounds: { create: backgroundCreates } } : {})
    }
  })

  // ── 4. Create the code and its rewards ───────────────────────────────────
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
    if (e.code === 'P2002') {
      throw createError({ statusCode: 400, statusMessage: 'Code already exists.' })
    }
    throw e
  }

  // ── 5. Return the new code record ────────────────────────────────────────
  return created
})
