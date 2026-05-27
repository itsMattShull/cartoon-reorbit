import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { getQueueStatus } from '@/server/utils/vpn-queue'
import { decryptIp } from '@/server/utils/ip-encrypt'
import { startOfDay } from 'date-fns'

export default defineEventHandler(async (event) => {
  // Auth: admin only
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

  const todayStart = startOfDay(new Date())

  const [totalChecked, totalFlagged, checkedToday, flaggedToday, recentActivity] =
    await Promise.all([
      prisma.vpnLog.count(),
      prisma.vpnLog.count({ where: { isVpn: true } }),
      prisma.vpnLog.count({ where: { detectedAt: { gte: todayStart } } }),
      prisma.vpnLog.count({ where: { isVpn: true, detectedAt: { gte: todayStart } } }),
      prisma.vpnLog.findMany({
        orderBy: { detectedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          userId: true,
          ip: true,
          isVpn: true,
          proxyType: true,
          isp: true,
          org: true,
          country: true,
          reason: true,
          detectedAt: true,
          user: { select: { username: true, discordTag: true } },
        },
      }),
    ])

  const queueStatus = getQueueStatus()

  // Decrypt IPs before sending to the admin frontend.
  // If decryption fails or the field is empty, fall back to '[redacted]'.
  const safeActivity = recentActivity.map((entry) => ({
    ...entry,
    ip: decryptIp(entry.ip) || '[redacted]',
  }))

  // Decrypt the encryptedIp stored in in-memory error log entries.
  const safeErrors = queueStatus.errors.map((err) => ({
    ...err,
    ip: decryptIp(err.encryptedIp) || '[redacted]',
  }))

  return {
    queue: {
      pending: queueStatus.pending,
      isRunning: queueStatus.isRunning,
      processedThisSession: queueStatus.totalProcessed,
      flaggedThisSession: queueStatus.totalFlagged,
      estimatedMinutes: Math.ceil(queueStatus.pending / 20),
    },
    db: {
      totalChecked,
      totalFlagged,
      checkedToday,
      flaggedToday,
    },
    recentActivity: safeActivity,
    errors: safeErrors,
  }
})
