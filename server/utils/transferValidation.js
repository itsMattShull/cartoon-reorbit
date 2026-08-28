// server/utils/transferValidation.js
//
// Shared guardrails for the admin "Transfer" feature (move points/cToons from
// one user to another, then deactivate the source). Used by both the preview
// endpoint and the enqueue endpoint so the rules can't drift between the two.
import { createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { transferQueue } from '@/server/utils/queues'

/**
 * Loads source/target users by id and enforces the transfer guardrails:
 *  - source and target must both exist
 *  - source !== target
 *  - neither side may be banned or already inactive (nothing meaningful to
 *    move off a dead account, and a dead/banned target shouldn't receive assets)
 * Admin-as-target is allowed; admin-as-source is allowed but flagged via
 * `sourceIsAdmin` so callers can warn/audit — never silently blocked here.
 */
export async function resolveTransferPair(sourceUserId, targetUserId) {
  if (!sourceUserId || !targetUserId) {
    throw createError({ statusCode: 400, statusMessage: 'Source and target user are required' })
  }
  if (sourceUserId === targetUserId) {
    throw createError({ statusCode: 400, statusMessage: 'Source and target must be different users' })
  }

  const [source, target] = await Promise.all([
    db.user.findUnique({
      where: { id: sourceUserId },
      select: { id: true, username: true, active: true, banned: true, isAdmin: true, discordId: true }
    }),
    db.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, username: true, active: true, banned: true, isAdmin: true }
    }),
  ])

  if (!source) throw createError({ statusCode: 404, statusMessage: 'Source user not found' })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Target user not found' })

  if (source.banned) throw createError({ statusCode: 400, statusMessage: 'Source user is banned' })
  if (!source.active) throw createError({ statusCode: 400, statusMessage: 'Source user is already inactive' })
  if (target.banned) throw createError({ statusCode: 400, statusMessage: 'Target user is banned' })
  if (!target.active) throw createError({ statusCode: 400, statusMessage: 'Target user is inactive' })

  return { source, target }
}

/**
 * Refuses to start a transfer if either user is already involved (as either
 * source or target) in a waiting/active/delayed transfer job. Prevents two
 * overlapping transfers from racing on the same account's points/cToons.
 */
export async function assertNoOverlappingTransfer(sourceUserId, targetUserId) {
  const jobs = await transferQueue.getJobs(['waiting', 'active', 'delayed'])
  const busy = jobs.find(j =>
    j.data?.sourceUserId === sourceUserId || j.data?.targetUserId === sourceUserId ||
    j.data?.sourceUserId === targetUserId || j.data?.targetUserId === targetUserId
  )
  if (busy) {
    throw createError({
      statusCode: 409,
      statusMessage: 'One of these users is already part of a transfer that is in progress. Please wait for it to finish.'
    })
  }
}
