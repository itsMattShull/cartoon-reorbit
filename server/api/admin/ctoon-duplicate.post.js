import {
  defineEventHandler,
  readMultipartFormData,
  getRequestHeader,
  createError
} from 'h3'
import { prisma } from '@/server/prisma'
import { computeMultiHash, bucketFromHash, findNearDuplicate, normalizeDuplicateThresholds } from '@/server/utils/multiHash'
 
const MAX_CANDIDATES = 2000

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const parts = await readMultipartFormData(event)
  let imagePart = null
  for (const part of parts || []) {
    if (part.filename) {
      imagePart = part
      break
    }
  }

  if (!imagePart) throw createError({ statusCode: 400, statusMessage: 'Image required.' })
  if (!['image/png', 'image/gif'].includes(imagePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'PNG or GIF only.' })
  }

  const { phash, dhash } = await computeMultiHash(imagePart.data)
  const bucket = bucketFromHash(phash)

  const config = await prisma.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { phashDuplicateThreshold: true, dhashDuplicateThreshold: true }
  })
  const thresholds = normalizeDuplicateThresholds({
    phash: config?.phashDuplicateThreshold,
    dhash: config?.dhashDuplicateThreshold
  })

  const candidates = await prisma.ctoonImageHash.findMany({
    where: { bucket },
    take: MAX_CANDIDATES,
    select: {
      ctoonId: true,
      phash: true,
      dhash: true,
      ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } }
    }
  })

  const match = findNearDuplicate({ phash, dhash }, candidates, thresholds)
  if (!match) return { duplicate: false }

  return {
    duplicate: true,
    match
  }
})
