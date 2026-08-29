import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401 })

  const { avatar } = await readBody(event)
  if (!avatar || typeof avatar !== 'string') throw createError({ statusCode: 400, statusMessage: 'Missing avatar' })

  // Reject path traversal / anything that isn't a bare filename before touching the filesystem.
  if (avatar.includes('/') || avatar.includes('\\') || avatar !== path.basename(avatar)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid avatar' })
  }

  // confirm the file actually exists in /public/avatars
  const avatarPath = path.resolve('public/avatars', avatar)
  try { await fs.access(avatarPath) }
  catch { throw createError({ statusCode: 400, statusMessage: 'Invalid avatar' }) }

  // If this filename belongs to the restricted Avatar catalog, the caller must actually own it
  // (see UserAvatar) — existing on disk is not authorization. Free-for-all filesystem avatars
  // (not in the Avatar table at all) stay selectable by anyone, unchanged.
  const restricted = await prisma.avatar.findUnique({ where: { filename: avatar }, select: { id: true } })
  if (restricted) {
    const owned = await prisma.userAvatar.findUnique({
      where: { userId_avatarId: { userId, avatarId: restricted.id } }
    })
    if (!owned) throw createError({ statusCode: 403, statusMessage: 'You have not unlocked that avatar' })
  }

  await prisma.user.update({ where: { id: userId }, data: { avatar } })

  return { success: true }
})
