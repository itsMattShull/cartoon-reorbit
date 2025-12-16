import { startOfDay, endOfDay } from 'date-fns'

import { prisma } from '@/server/prisma'

const lastCheck = new Map() // key: userId|ip -> timestamp ms
const TTL_MS = Number(process.env.LOGIN_LOG_TTL_MS || 10 * 60_000)

function isStaticOrAsset(event) {
  try {
    const url = getRequestURL(event)
    const p = url.pathname || ''
    if (p.startsWith('/_nuxt') || p.startsWith('/public') || p === '/favicon.ico') return true
    if (/(\.js|\.css|\.png|\.jpg|\.jpeg|\.gif|\.svg|\.ico|\.webp|\.mp3|\.woff2?)$/i.test(p)) return true
    const accept = String(event.node.req.headers['accept'] || '')
    const isHtml = accept.includes('text/html')
    const isApi  = p.startsWith('/api')
    return !(isHtml || isApi)
  } catch { return false }
}

export default defineEventHandler(async (event) => {
  const userId = event.context?.userId
  if (!userId) return
  if (isStaticOrAsset(event)) return

  const ip = getRequestIP(event)
  if (!ip) return

  const todayStart = startOfDay(new Date())
  const todayEnd = endOfDay(new Date())

  // Throttle same user/ip checks to reduce DB load
  const key = `${userId}|${ip}`
  const now = Date.now()
  const prev = lastCheck.get(key) || 0
  if (now - prev < TTL_MS) return
  lastCheck.set(key, now)

  const existingLog = await prisma.loginLog.findFirst({
    where: {
      userId,
      ip,
      createdAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
  })

  if (!existingLog) {
    await prisma.loginLog.create({
      data: {
        userId,
        ip,
      },
    })
  }
})

function getRequestIP(event) {
  const headers = event.node.req.headers
  const forwarded = headers['x-forwarded-for']
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim()
    if (firstIp) return firstIp
  }

  return event.node.req.socket?.remoteAddress || null
}
