// server/api/ctoos.get.js
import { PrismaClient } from '@prisma/client'
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'

let prisma
function db() {
  if (!prisma) prisma = new PrismaClient()
  return prisma
}

export default defineEventHandler(async (event) => {
  // 1) Ensure user is authenticated & isAdmin
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

  try {
    const ctoons = await db().ctoon.findMany({
      select: {
        id:        true,
        name:      true,
        rarity:    true,
        assetPath: true
      }
    })
    return ctoons
  } catch (err) {
    console.error('Failed to fetch cToons:', err)
    throw createError({ statusCode: 500, statusMessage: 'Unable to load cToons' })
  }
})
