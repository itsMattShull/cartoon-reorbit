/**
 * Rate-limited VPN check queue.
 * Processes at most 20 IPs per minute (1 every 3 seconds).
 * Deduplicates: won't enqueue the same (userId, encryptedIp) twice.
 */
import { prisma } from '@/server/prisma'
import { checkVpn } from '@/server/utils/vpn-check'
import { decryptIp } from '@/server/utils/ip-encrypt'

const queue = []           // [{ userId, encryptedIp }]
const inQueue = new Set()  // "userId:encryptedIp" for dedup
let timer = null

function startTimer() {
  if (timer) return
  timer = setInterval(processNext, 3000) // 1 every 3s = 20/min
}

async function processNext() {
  if (queue.length === 0) {
    clearInterval(timer)
    timer = null
    return
  }

  const { userId, encryptedIp } = queue.shift()
  inQueue.delete(`${userId}:${encryptedIp}`)

  const plainIp = decryptIp(encryptedIp)
  if (!plainIp) return

  try {
    // Double-check not already logged (race-condition guard)
    const existing = await prisma.vpnLog.findFirst({ where: { userId, ip: encryptedIp } })
    if (existing) return

    const result = await checkVpn(plainIp)
    if (!result) return

    await prisma.vpnLog.create({
      data: {
        userId,
        ip: encryptedIp,
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
  } catch (err) {
    console.error('[vpn-queue] Error processing item:', err.message)
  }
}

/**
 * Add a (userId, encryptedIp) pair to the VPN check queue.
 * Safe to call from middleware — does not block the request.
 */
export function enqueueVpnCheck(userId, encryptedIp) {
  const key = `${userId}:${encryptedIp}`
  if (inQueue.has(key)) return
  inQueue.add(key)
  queue.push({ userId, encryptedIp })
  startTimer()
}

/** Exposed for the backfill script to check queue depth. */
export function queueLength() {
  return queue.length
}
