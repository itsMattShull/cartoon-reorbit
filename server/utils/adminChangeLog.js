// server/utils/adminChangeLog.js
import { prisma } from '../prisma.js'

// Hard cap on how many cToon entries get embedded per audit record — protects
// row size and page-render cost for accounts holding very large inventories.
export const MAX_AUDIT_CTOONS = 200

function toStr(val) {
  if (val === undefined) return null
  if (val === null) return null
  if (typeof val === 'string') return val
  try { return JSON.stringify(val) } catch { return String(val) }
}

/**
 * Write an admin change log entry. Accepts either a Prisma client or tx.
 * Does not throw — failures are logged but ignored to avoid blocking saves.
 *
 * `targetUserId`/`targetUsername` identify the user the action was performed
 * on/against (as opposed to `userId`, which is always the acting admin).
 */
export async function logAdminChange(clientOrTx, { userId, area, key, prevValue, newValue, targetUserId, targetUsername }) {
  const client = clientOrTx || prisma
  try {
    await client.adminChangeLog.create({
      data: {
        userId,
        area,
        key,
        prevValue: toStr(prevValue),
        newValue: toStr(newValue),
        targetUserId: targetUserId || null,
        targetUsername: targetUsername || null
      }
    })
  } catch (err) {
    console.warn('AdminChangeLog write failed:', err?.message || err)
  }
}

/**
 * Build a consistent audit payload for admin actions that seize points/cToons
 * from a user (dissolve, cheating-tool apply, check-cheating enforce).
 *
 * `ctoons` must only contain entries for CONFIRMED SUCCESSFUL transfers —
 * never attempted/candidate items — so the audit trail never asserts a
 * removal that didn't actually happen.
 */
export function buildSeizureAuditPayload({
  action,
  target,
  involvedAccounts = [],
  accountsDeactivated = [],
  pointsRemoved = 0,
  pointsRecipient = null,
  ctoons = []
}) {
  const totalCtoons = ctoons.length
  const truncated = totalCtoons > MAX_AUDIT_CTOONS
  return {
    action,
    target,
    involvedAccounts,
    accountsDeactivated,
    pointsRemoved,
    pointsRecipient,
    totalCtoons,
    ctoons: truncated ? ctoons.slice(0, MAX_AUDIT_CTOONS) : ctoons,
    ctoonsTruncated: truncated
  }
}
