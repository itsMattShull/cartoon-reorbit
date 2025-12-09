// server/utils/adminChangeLog.js
import { prisma } from '@/server/prisma'

function toStr(val) {
  if (val === undefined) return null
  if (val === null) return null
  if (typeof val === 'string') return val
  try { return JSON.stringify(val) } catch { return String(val) }
}

/**
 * Write an admin change log entry. Accepts either a Prisma client or tx.
 * Does not throw — failures are logged but ignored to avoid blocking saves.
 */
export async function logAdminChange(clientOrTx, { userId, area, key, prevValue, newValue }) {
  const client = clientOrTx || prisma
  try {
    await client.adminChangeLog.create({
      data: {
        userId,
        area,
        key,
        prevValue: toStr(prevValue),
        newValue: toStr(newValue)
      }
    })
  } catch (err) {
    console.warn('AdminChangeLog write failed:', err?.message || err)
  }
}

