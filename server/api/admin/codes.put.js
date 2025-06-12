// server/api/admin/codes.put.js


import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Admin check
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

  // 2. Parse & validate input
  const { code, maxClaims, expiresAt, rewards } = await readBody(event)
  if (!code || typeof code !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Code is required.' })
  }
  if (typeof maxClaims !== 'number' || maxClaims < 1) {
    throw createError({ statusCode: 400, statusMessage: 'maxClaims must be >= 1.' })
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

  // 3. Ensure the code exists (and fetch its internal id)
  const existing = await prisma.claimCode.findUnique({
    where: { code },
    select: { id: true }
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Code not found.' })
  }
  const codeId = existing.id

  // 4. Build nested create payload for ClaimCodeReward + RewardCtoon
  const rewardCreates = rewards.map((r, i) => {
    const { points, ctoons } = r
    if (points != null && (typeof points !== 'number' || points < 0)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid points in rewards[${i}].` })
    }
    if (!Array.isArray(ctoons)) {
      throw createError({ statusCode: 400, statusMessage: `ctoons must be an array in rewards[${i}].` })
    }
    const ctoonCreates = ctoons.map((c, j) => {
      if (!c.ctoonId || typeof c.ctoonId !== 'string') {
        throw createError({ statusCode: 400, statusMessage: `Invalid ctoonId in rewards[${i}].ctoons[${j}].` })
      }
      if (typeof c.quantity !== 'number' || c.quantity < 1) {
        throw createError({ statusCode: 400, statusMessage: `Invalid quantity in rewards[${i}].ctoons[${j}].` })
      }
      return { ctoonId: c.ctoonId, quantity: c.quantity }
    })
    return {
      points: points ?? 0,
      ctoons: { create: ctoonCreates }
    }
  })

  // 5. In one transaction:
  //    a) delete all child RewardCtoon rows for this code’s rewards
  //    b) delete all ClaimCodeReward rows for this code
  //    c) update maxClaims/expiresAt & create new reward batches
  const [, , updated] = await prisma.$transaction([
    prisma.rewardCtoon.deleteMany({
      where: { reward: { codeId } }
    }),
    prisma.claimCodeReward.deleteMany({
      where: { codeId }
    }),
    prisma.claimCode.update({
      where: { code },
      data: {
        maxClaims,
        expiresAt: expiresDate,
        rewards: {
          create: rewardCreates
        }
      }
    })
  ])

  return updated
})
