// server/api/auth/device-fingerprint.post.js
// Records a DeviceFingerprintLog row tying the current authenticated
// user + request IP to a client-computed FingerprintJS visitorId.
//
// Called by plugins/device-fingerprint.client.js once per browser session.

import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'
import { prisma } from '@/server/prisma'

function getRequestIP(event) {
  return (
    event.node.req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    event.node.req.connection?.remoteAddress ||
    event.node.req.socket?.remoteAddress ||
    ''
  )
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  const visitorId = typeof body?.visitorId === 'string' ? body.visitorId.trim() : ''
  if (!visitorId || visitorId.length < 8 || visitorId.length > 128) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid visitorId' })
  }

  const ip = getRequestIP(event)

  await prisma.deviceFingerprintLog.create({
    data: {
      userId: me.id,
      ip,
      visitorId
    }
  })

  return { ok: true }
})
