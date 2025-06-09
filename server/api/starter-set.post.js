// server/api/grant-ctoens.post.js
import { PrismaClient } from '@prisma/client'
import { defineEventHandler, readBody, createError } from 'h3'
import { mintQueue } from '../utils/queues'

export default defineEventHandler(async (event) => {
  const prisma = new PrismaClient()
  try {
    // 1) Authenticate
    const userId = event.context.userId
    if (!userId) {
      throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
    }

    // 2) Parse & validate payload
    const { ctoonIds } = await readBody(event)
    if (!Array.isArray(ctoonIds) || ctoonIds.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid ctoonIds' })
    }

    // 3) Fetch definitions & existing ownership
    const [ctoDetails, existingCtoons] = await Promise.all([
      prisma.ctoon.findMany({ where: { id: { in: ctoonIds } } }),
      prisma.userCtoon.findMany({
        where: {
          userId,
          ctoonId: { in: ctoonIds }
        }
      })
    ])

    const existingMap = new Map(
      existingCtoons.map(uc => [uc.ctoonId, uc])
    )

    // 4) Determine which mints to enqueue
    const toMint = []

    for (const ctoon of ctoDetails) {
      const already = existingMap.get(ctoon.id)

      // per-user limit
      if (ctoon.perUserLimit !== null && already) {
        const count = await prisma.userCtoon.count({
          where: { userId, ctoonId: ctoon.id }
        })
        if (count >= ctoon.perUserLimit) {
          continue
        }
      }

      // how many have been minted so far?
      const totalMinted = await prisma.userCtoon.count({
        where: { ctoonId: ctoon.id }
      })

      // enqueue exactly one mint per requested ID
      // if you wanted to mint multiple of the same ID, push multiple times
      toMint.push(ctoon.id)
    }

    if (toMint.length === 0) {
      throw createError({
        statusCode: 409,
        statusMessage: 'No cToons could be granted (already owned or over limit)'
      })
    }

    // 5) Enqueue each mint job
    await Promise.all(
      toMint.map(ctoonId =>
        mintQueue.add('mintCtoon', { userId, ctoonId })
      )
    )

    // 6) Return immediately
    return { success: true, added: toMint.length }

  } finally {
    await prisma.$disconnect()
  }
})
