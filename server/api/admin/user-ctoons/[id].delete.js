// server/api/admin/user-ctoons/[id].delete.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // --- auth/admin check via session cookie ---
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

  // --- extract the UserCtoon ID from the route ---
  const { id } = event.context.params
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing UserCtoon id' })
  }

  // --- perform the deletion ---
  try {
    await prisma.userCtoon.delete({
      where: { id }
    })
    return { success: true }
  } catch (err) {
    console.error('Failed to delete UserCtoon:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete entry' })
  }
})
