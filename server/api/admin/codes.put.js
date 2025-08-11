// server/api/admin/codes.put.js
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Admin check
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

  // 2) Parse & validate input
  const { code, maxClaims, expiresAt, rewards, prerequisites } = await readBody(event)

  if (!code || typeof code !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Code is required.' })
  }
  if (typeof maxClaims !== 'number' || maxClaims < 1) {
    throw createError({ statusCode: 400, statusMessage: 'maxClaims must be >= 1.' })
  }

  let expiresDate = null
  if (expiresAt) {
    const dt = new Date(expiresAt)
    if (isNaN(dt.getTime())) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid expiresAt.' })
    }
    expiresDate = dt
  }

  if (!Array.isArray(rewards) || rewards.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one reward batch is required.' })
  }
  if (prerequisites && !Array.isArray(prerequisites)) {
    throw createError({ statusCode: 400, statusMessage: 'prerequisites must be an array.' })
  }

  // 3) Ensure the code exists
  const existing = await prisma.claimCode.findUnique({
    where: { code },
    select: { id: true }
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Code not found.' })
  }
  const codeId = existing.id

  // 4) Build nested payloads for rewards & prerequisites
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

    // Accept backgrounds as either [{backgroundId}] or ["id","id"]
    const rawBgs =
      Array.isArray(r.backgrounds) ? r.backgrounds :
      Array.isArray(r.backgroundIds) ? r.backgroundIds :
      []

    const backgroundCreates = rawBgs.map((b, k) => {
      const id = typeof b === 'string' ? b : b?.backgroundId
      if (!id || typeof id !== 'string') {
        throw createError({ statusCode: 400, statusMessage: `Invalid backgroundId in rewards[${i}].backgrounds[${k}]` })
      }
      return { backgroundId: id }
    })

    return {
      points: points ?? 0,
      ctoons: { create: ctoonCreates },
      ...(backgroundCreates.length ? { backgrounds: { create: backgroundCreates } } : {})
    }
  })

  const prereqCreates = (prerequisites || []).map((p, i) => {
    if (!p?.ctoonId || typeof p.ctoonId !== 'string') {
      throw createError({ statusCode: 400, statusMessage: `Invalid ctoonId in prerequisites[${i}].` })
    }
    return { ctoonId: p.ctoonId }
  })

  // 5) In one transaction: clear old rewards/prereqs then update with new batches
  const results = await prisma.$transaction([
    prisma.rewardCtoon.deleteMany({ where: { reward: { codeId } } }),
    prisma.rewardBackground.deleteMany({ where: { reward: { codeId } } }),
    prisma.claimCodeReward.deleteMany({ where: { codeId } }),
    prisma.claimCodePrerequisite.deleteMany({ where: { codeId } }),
    prisma.claimCode.update({
      where: { code },
      data: {
        maxClaims,
        expiresAt: expiresDate,
        rewards:       { create: rewardCreates },
        prerequisites: { create: prereqCreates }
      }
    })
  ])

  const updated = results[results.length - 1]
  return updated
})
