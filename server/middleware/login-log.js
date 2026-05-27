import { startOfDay, endOfDay } from 'date-fns'

import { prisma } from '@/server/prisma'
import { isPrivateIp } from '@/server/utils/vpn-check'
import { encryptIp } from '@/server/utils/ip-encrypt'
import { enqueueVpnCheck } from '@/server/utils/vpn-queue'

export default defineEventHandler(async (event) => {
  const userId = event.context?.userId
  if (!userId) return

  const ip = getRequestIP(event)
  if (!ip) return

  // 1. LoginLog — still stored as plaintext (internal log, one per day per combo)
  const todayStart = startOfDay(new Date())
  const todayEnd = endOfDay(new Date())

  const existingLog = await prisma.loginLog.findFirst({
    where: {
      userId,
      ip,
      createdAt: { gte: todayStart, lte: todayEnd },
    },
  })

  if (!existingLog) {
    await prisma.loginLog.create({ data: { userId, ip } })
  }

  // 2. VPN check — only for public IPs, deduped via UserIP table (encrypted)
  if (!isPrivateIp(ip)) {
    const encryptedIp = encryptIp(ip)

    // Check if we've seen this (userId, encryptedIp) combo before
    const existingUserIp = await prisma.userIP.findUnique({
      where: { userId_ip: { userId, ip: encryptedIp } },
    })

    if (!existingUserIp) {
      // New combo — record it and queue a VPN check
      try {
        await prisma.userIP.create({ data: { userId, ip: encryptedIp } })
      } catch {
        // Ignore unique constraint violations (race condition)
      }
      enqueueVpnCheck(userId, encryptedIp)
    }
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
