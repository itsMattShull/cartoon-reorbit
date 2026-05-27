import { startOfDay, endOfDay } from 'date-fns'

import { prisma } from '@/server/prisma'
import { checkVpn, isPrivateIp } from '@/server/utils/vpn-check'

export default defineEventHandler(async (event) => {
  const userId = event.context?.userId
  if (!userId) return

  const ip = getRequestIP(event)
  if (!ip) return

  const todayStart = startOfDay(new Date())
  const todayEnd = endOfDay(new Date())

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

  // Non-blocking VPN check
  if (userId && ip && !isPrivateIp(ip)) {
    Promise.resolve().then(async () => {
      // Skip if we already have a VpnLog for this (userId, ip) combo
      const existing = await prisma.vpnLog.findFirst({ where: { userId, ip } })
      if (existing) return

      const result = await checkVpn(ip)
      if (!result) return

      await prisma.vpnLog.create({
        data: {
          userId,
          ip,
          isVpn: result.isVpn,
          proxyType: result.proxyType,
          isp: result.isp,
          org: result.org,
          asn: result.asn,
          country: result.country,
          countryCode: result.countryCode,
          reason: result.reason,
        },
      })

      if (result.isVpn) {
        await prisma.user.update({
          where: { id: userId },
          data: { vpnDetected: true },
        })
      }
    }).catch(() => {})
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
