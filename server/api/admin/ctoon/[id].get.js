// /api/admin/ctoon/[id].get.js

import { PrismaClient } from '@prisma/client'
import { defineEventHandler, getRequestHeader, createError } from 'h3'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  const id = event.context.params.id

  // Admin check
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
    const ctoon = await prisma.ctoon.findUnique({
      where: { id },
    })

    if (!ctoon) {
      throw createError({ statusCode: 404, statusMessage: 'cToon not found' })
    }

    return { success: true, ctoon }
  } catch (error) {
    console.error(error)
    throw createError({ statusCode: 500, statusMessage: error.message || 'Internal Server Error' })
  }
})
