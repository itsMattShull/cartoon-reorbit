// prisma/refundChristmasPresents.js
// Refund 100 points per purchased "Christmas Present {1..4}" cToon.
// - Finds cToons by exact names
// - Counts UserCtoon rows (userPurchased = true) per user across those cToons
// - Awards 100 points per item and logs a PointsLog entry with method "holiday refund"
//
// Usage:
//   Dry run (no writes):
//     node prisma/refundChristmasPresents.js
//   Apply changes (perform refunds):
//     node prisma/refundChristmasPresents.js --apply

import { prisma } from '../server/prisma.js'

const CTOON_NAMES = [
  'Christmas Present 1',
  'Christmas Present 2',
  'Christmas Present 3',
  'Christmas Present 4'
]

const PER_ITEM_REFUND = 100
const LOG_METHOD = 'holiday refund'
const BATCH_SIZE = 100
const SKIP_IF_ALREADY_REFUNDED = true
const APPLY = process.argv.includes('--apply') || process.argv.includes('--refund') || process.argv.includes('--yes')

async function main() {
  console.log(`🔎 Looking up Christmas Present cToons… (mode: ${APPLY ? 'APPLY' : 'DRY-RUN'})`)
  const ctoons = await prisma.ctoon.findMany({
    where: { name: { in: CTOON_NAMES } },
    select: { id: true, name: true }
  })

  if (ctoons.length === 0) {
    console.log('No matching cToons found by those names. Exiting.')
    return
  }

  const idByName = Object.fromEntries(ctoons.map(c => [c.name, c.id]))
  const nameById = Object.fromEntries(ctoons.map(c => [c.id, c.name]))
  const ctoonIds = ctoons.map(c => c.id)

  if (ctoons.length !== CTOON_NAMES.length) {
    const missing = CTOON_NAMES.filter(n => !idByName[n])
    console.warn(`⚠️ Missing cToons for names: ${missing.join(', ')}`)
  }

  console.log('🔢 Aggregating purchases per user (userPurchased = true)…')
  const grouped = await prisma.userCtoon.groupBy({
    by: ['userId', 'ctoonId'],
    where: { ctoonId: { in: ctoonIds }, userPurchased: true },
    _count: { _all: true }
  })

  if (grouped.length === 0) {
    console.log('No purchases found for those cToons. Nothing to refund.')
    return
  }

  // Build per-user summary: total and per-ctoon counts
  const perUser = new Map() // userId -> { total: number, byCtoon: Record<ctoonId, count> }
  for (const g of grouped) {
    const u = perUser.get(g.userId) || { total: 0, byCtoon: {} }
    const count = g._count._all
    u.total += count
    u.byCtoon[g.ctoonId] = count
    perUser.set(g.userId, u)
  }

  let userIds = Array.from(perUser.keys())

  // Optional: idempotency guard — skip users already refunded with this method
  if (SKIP_IF_ALREADY_REFUNDED) {
    const existing = await prisma.pointsLog.findMany({
      where: { userId: { in: userIds }, method: LOG_METHOD },
      select: { userId: true }
    })
    const already = new Set(existing.map(e => e.userId))
    if (already.size) {
      userIds = userIds.filter(id => !already.has(id))
      console.log(`⏭️ Skipping ${already.size} user(s) already refunded.`)
    }
  }

  if (userIds.length === 0) {
    console.log('No users left to refund. Exiting.')
    return
  }

  // Fetch usernames for nicer logs
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true }
  })
  const usernameById = Object.fromEntries(users.map(u => [u.id, u.username || u.id]))

  const plannedTotal = userIds.reduce((sum, uid) => {
    const info = perUser.get(uid)
    return sum + ((info?.total || 0) * PER_ITEM_REFUND)
  }, 0)

  console.log(`💸 ${APPLY ? 'Refunding' : 'Would refund'} ${PER_ITEM_REFUND} points per purchased item…`)
  console.log(`👥 Users to process: ${userIds.length}`)
  console.log(`🧮 ${APPLY ? 'Total refund' : 'Total planned refund'}: ${plannedTotal} points`)

  let processed = 0
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(async (userId) => {
      const info = perUser.get(userId)
      const totalItems = info?.total || 0
      if (totalItems <= 0) return
      const refundAmount = PER_ITEM_REFUND * totalItems

      if (APPLY) {
        await prisma.$transaction(async (tx) => {
          const updated = await tx.userPoints.upsert({
            where:  { userId },
            update: { points: { increment: refundAmount } },
            create: { userId, points: refundAmount }
          })
          await tx.pointsLog.create({
            data: {
              userId,
              direction: 'increase',
              points: refundAmount,
              total: updated.points,
              method: LOG_METHOD
            }
          })
        })
      }

      // Build a simple breakdown for console output
      const byCtoon = info?.byCtoon || {}
      const parts = []
      for (const [ctoonId, count] of Object.entries(byCtoon)) {
        parts.push(`${nameById[ctoonId] || ctoonId}: ${count}`)
      }
      const userLabel = usernameById[userId] || userId
      if (APPLY) {
        console.log(`✅ Refunded ${refundAmount} pts to ${userLabel} — ${parts.join(', ')}`)
      } else {
        console.log(`📝 Would refund ${refundAmount} pts to ${userLabel} — ${parts.join(', ')}`)
      }
    }))
    processed += batch.length
    console.log(`…progress: ${processed}/${userIds.length}`)
  }

  console.log(`🎉 Done. ${APPLY ? 'Applied refunds.' : 'This was a dry run; no changes made.'}`)
}

main()
  .catch((err) => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
  .finally(() => {})
