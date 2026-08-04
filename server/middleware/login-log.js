import { startOfDay, endOfDay } from 'date-fns'

import { prisma } from '@/server/prisma'
import { isPrivateIp } from '@/server/utils/vpn-check'
import { encryptIp } from '@/server/utils/ip-encrypt'
import { enqueueVpnCheck } from '@/server/utils/vpn-queue'
import { getTrustedClientIp } from '@/server/utils/requestIp'
import { isHotPath } from '@/server/utils/hotPaths'

export default defineEventHandler(async (event) => {
  // Per-interaction game endpoints skip the login/IP bookkeeping — a 25-question run would
  // otherwise repeat the same two lookups 25 times over. The surrounding page navigation
  // still logs the session normally.
  if (isHotPath(event.path)) return

  const userId = event.context?.userId
  if (!userId) return

  const ip = getTrustedClientIp(event)
  if (!ip) return

  const encryptedLoginIp = encryptIp(ip)
  if (!encryptedLoginIp) {
    console.error('[login-log] Skipping login log — IP encryption returned null for userId:', userId)
    return
  }

  // 1. LoginLog — stored encrypted, one per day per combo
  const todayStart = startOfDay(new Date())
  const todayEnd = endOfDay(new Date())

  const existingLog = await prisma.loginLog.findFirst({
    where: {
      userId,
      ip: encryptedLoginIp,
      createdAt: { gte: todayStart, lte: todayEnd },
    },
  })

  if (!existingLog) {
    await prisma.loginLog.create({ data: { userId, ip: encryptedLoginIp } })
  }

  // 2. VPN check — only for public IPs, deduped via UserIP table (encrypted)
  if (!isPrivateIp(ip)) {
    const encryptedIp = encryptIp(ip)
    if (!encryptedIp) return // encryption failed, do not proceed

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

