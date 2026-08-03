// server/api/czone-mail/blocks/index.post.js
// Block a player from sending you cMail.
//
// The block is stored on the generic UserBlock relation rather than a
// cMail-specific table: a player told "you can block them" reasonably expects
// that to widen to cZone chat and trade offers later, and this avoids a second
// competing block concept when it does.

import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

const MAX_BLOCKS = 200

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const username = String(body?.username || '').trim()
  if (!username) throw createError({ statusCode: 400, statusMessage: 'A username is required.' })

  const target = await db.user.findUnique({ where: { username }, select: { id: true } })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'That player was not found.' })
  if (target.id === userId) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot block yourself.' })
  }

  const existing = await db.userBlock.count({ where: { blockerId: userId } })
  if (existing >= MAX_BLOCKS) {
    throw createError({ statusCode: 400, statusMessage: `You can block at most ${MAX_BLOCKS} players.` })
  }

  // Idempotent: blocking someone already blocked is a success, not an error.
  await db.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId: userId, blockedId: target.id } },
    create: { blockerId: userId, blockedId: target.id },
    update: {}
  })

  return { success: true }
})
