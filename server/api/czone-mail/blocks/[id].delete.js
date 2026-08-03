// server/api/czone-mail/blocks/[id].delete.js
// Unblock a player.

import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing block id.' })

  // Scoped by blockerId so one player can never remove another's block.
  const result = await db.userBlock.deleteMany({ where: { id, blockerId: userId } })
  if (result.count === 0) throw createError({ statusCode: 404, statusMessage: 'Block not found.' })

  return { success: true }
})
