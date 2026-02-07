import { defineEventHandler, getRequestHeader, createError } from 'h3'
import {
  getScaleUpUntil,
  setScaleUpUntil,
  scheduleDownsize,
  getScaleInProgress,
  setScaleInProgress
} from '@/server/utils/devScaleState'
import { resizeCpuRamOnly } from '@/server/utils/devResize'

const SCALE_WINDOW_MS = 5 * 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const dropletId = process.env.DROPLET_ID
  const token = process.env.DO_ACCESS_TOKEN || process.env.DO_API_TOKEN || process.env.DO_TOKEN
  const upsizeSlug = process.env.UPSIZE_SLUG
  const downsizeSlug = process.env.DOWNSIZE_SLUG

  if (!dropletId) throw createError({ statusCode: 500, statusMessage: 'Missing DROPLET_ID' })
  if (!token) throw createError({ statusCode: 500, statusMessage: 'Missing DO_ACCESS_TOKEN' })
  if (!upsizeSlug || !downsizeSlug) {
    throw createError({ statusCode: 500, statusMessage: 'Missing UPSIZE_SLUG or DOWNSIZE_SLUG' })
  }

  const existing = getScaleUpUntil()
  if (existing && existing > Date.now()) {
    return { status: 'already_scheduled', scaleUpUntil: existing }
  }

  if (getScaleInProgress()) {
    return { status: 'busy', scaleUpUntil: existing || null }
  }

  setScaleInProgress(true)
  const scaleUpUntil = Date.now() + SCALE_WINDOW_MS
  setScaleUpUntil(scaleUpUntil)
  try {
    await resizeCpuRamOnly({ token, dropletId, sizeSlug: upsizeSlug })
    const delayMs = Math.max(scaleUpUntil - Date.now(), 0)
    scheduleDownsize(async () => {
      try {
        await resizeCpuRamOnly({ token, dropletId, sizeSlug: downsizeSlug })
      } catch (err) {
        console.error('[dev scale] downsize failed:', err?.message || err)
      } finally {
        setScaleUpUntil(null)
      }
    }, delayMs)

    return { status: 'scheduled', scaleUpUntil }
  } catch (err) {
    setScaleUpUntil(null)
    throw err
  } finally {
    setScaleInProgress(false)
  }
})
