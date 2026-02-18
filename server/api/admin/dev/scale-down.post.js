import { defineEventHandler, getRequestHeader, createError } from 'h3'
import {
  clearDownsizeSchedule,
  getScaleInProgress,
  getScaleUpUntil,
  setScaleInProgress,
  setScaleUpUntil
} from '@/server/utils/devScaleState'
import { resizeCpuRamOnly } from '@/server/utils/devResize'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const dropletId = process.env.DROPLET_ID
  const token = process.env.DO_ACCESS_TOKEN || process.env.DO_API_TOKEN || process.env.DO_TOKEN
  const downsizeSlug = process.env.DOWNSIZE_SLUG

  if (!dropletId) throw createError({ statusCode: 500, statusMessage: 'Missing DROPLET_ID' })
  if (!token) throw createError({ statusCode: 500, statusMessage: 'Missing DO_ACCESS_TOKEN' })
  if (!downsizeSlug) throw createError({ statusCode: 500, statusMessage: 'Missing DOWNSIZE_SLUG' })

  if (getScaleInProgress()) {
    return { status: 'busy', scaleUpUntil: getScaleUpUntil() }
  }

  setScaleInProgress(true)
  try {
    clearDownsizeSchedule()
    await resizeCpuRamOnly({ token, dropletId, sizeSlug: downsizeSlug })
    setScaleUpUntil(null)
    return { status: 'downsized', scaleUpUntil: null }
  } finally {
    setScaleInProgress(false)
  }
})
