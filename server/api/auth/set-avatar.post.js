import { promises as fs } from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const prisma = new PrismaClient()
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401 })

  const { avatar } = await readBody(event)
  if (!avatar) throw createError({ statusCode: 400, statusMessage: 'Missing avatar' })

  // confirm the file actually exists in /public/avatars
  const avatarPath = path.resolve('public/avatars', avatar)
  try { await fs.access(avatarPath) }
  catch { throw createError({ statusCode: 400, statusMessage: 'Invalid avatar' }) }

  await prisma.user.update({ where: { id: userId }, data: { avatar } })

  return { success: true }
})