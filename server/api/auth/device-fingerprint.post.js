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
import { encryptIp } from '@/server/utils/ip-encrypt'

function getRequestIP(event) {
  return (
    event.node.req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    event.node.req.connection?.remoteAddress ||
    event.node.req.socket?.remoteAddress ||
    ''
  )
}

// Derive a compact, human-readable device summary from a User-Agent string.
// Returns a string like "Mobile · iOS 17 · Safari" or "Desktop · Windows · Chrome 124".
// No external dependency — covers the vast majority of real browsers.
function parseDeviceType(ua) {
  if (!ua) return null

  let deviceType = 'Desktop'
  let os = 'Unknown'
  let osVersion = ''
  let browser = 'Unknown'
  let browserVersion = ''

  // ── OS / device class ──────────────────────────────────────────────────────
  if (/iPhone/i.test(ua)) {
    deviceType = 'Mobile'
    os = 'iOS'
    const m = ua.match(/OS (\d+)[_.]/)
    if (m) osVersion = ` ${m[1]}`
  } else if (/iPad/i.test(ua)) {
    deviceType = 'Tablet'
    os = 'iPadOS'
    const m = ua.match(/OS (\d+)[_.]/)
    if (m) osVersion = ` ${m[1]}`
  } else if (/Android/i.test(ua)) {
    os = 'Android'
    const m = ua.match(/Android (\d+)/)
    if (m) osVersion = ` ${m[1]}`
    deviceType = /Mobile/i.test(ua) ? 'Mobile' : 'Tablet'
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS'
  } else if (/Windows NT/i.test(ua)) {
    os = 'Windows'
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS'
  } else if (/Linux/i.test(ua)) {
    os = 'Linux'
  }

  // ── Browser (check specifics before generic Chrome/Safari) ────────────────
  if (/Edg\//i.test(ua)) {
    browser = 'Edge'
    const m = ua.match(/Edg\/(\d+)/)
    if (m) browserVersion = ` ${m[1]}`
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = 'Opera'
    const m = ua.match(/(?:OPR|Opera)\/(\d+)/)
    if (m) browserVersion = ` ${m[1]}`
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = 'Samsung'
    const m = ua.match(/SamsungBrowser\/(\d+)/)
    if (m) browserVersion = ` ${m[1]}`
  } else if (/Firefox\/(\d+)/i.test(ua)) {
    browser = 'Firefox'
    const m = ua.match(/Firefox\/(\d+)/)
    if (m) browserVersion = ` ${m[1]}`
  } else if (/Chrome\/(\d+)/i.test(ua)) {
    browser = 'Chrome'
    const m = ua.match(/Chrome\/(\d+)/)
    if (m) browserVersion = ` ${m[1]}`
  } else if (/Version\/(\d+).*Safari/i.test(ua)) {
    browser = 'Safari'
    const m = ua.match(/Version\/(\d+)/)
    if (m) browserVersion = ` ${m[1]}`
  } else if (/Safari/i.test(ua)) {
    browser = 'Safari'
  }

  return `${deviceType} · ${os}${osVersion} · ${browser}${browserVersion}`
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
  const ua = getRequestHeader(event, 'user-agent') || ''
  const deviceType = parseDeviceType(ua)
  const encryptedIp = encryptIp(ip)

  // Daily dedup: only store one row per day per unique combination of
  // (user, ip, visitorId, deviceType).  "Day" is defined as UTC midnight→midnight.
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const alreadyLogged = await prisma.deviceFingerprintLog.findFirst({
    where: {
      userId:     me.id,
      ip:         encryptedIp,
      visitorId,
      deviceType: deviceType ?? null,
      createdAt:  { gte: todayStart }
    },
    select: { id: true }
  })

  if (alreadyLogged) return { ok: true }

  await prisma.deviceFingerprintLog.create({
    data: {
      userId: me.id,
      ip:     encryptedIp,
      visitorId,
      deviceType
    }
  })

  return { ok: true }
})
