// server/scripts/assign-orphaned-ctoones.js
// Usage:
//   DATABASE_URL="postgres://..." node server/scripts/assign-orphaned-ctoones.js
//
// What it does:
//  - Looks for minted UserCtoons for the two specified ctoonIds
//  - If a minted entry has no owner (userId == NULL), it assigns it to the user
//    with username "CartoonReOrbitOfficial"

import { prisma } from '../server/prisma.js'

const TARGET_CTOON_IDS = [
  'a28e1213-05bc-4e62-9281-0a1444c07e84',
  '5ee3d19d-b2f0-4105-8dcd-ace72acea98e',
]
const TARGET_USERNAME = 'CartoonReOrbitOfficial'

async function main() {
  // 1) Find the target user
  const targetUser = await prisma.user.findUnique({
    where: { username: TARGET_USERNAME },
    select: { id: true, username: true },
  })

  if (!targetUser) {
    throw new Error(
      `❌ No user found with username "${TARGET_USERNAME}". Aborting.`
    )
  }
  console.log(`👤 Assigning orphaned cToons to user: ${targetUser.username} (${targetUser.id})`)

  // 2) Load all minted entries for the target ctoonIds
  const minted = await prisma.userCtoon.findMany({
    where: { ctoonId: { in: TARGET_CTOON_IDS } },
    select: { id: true, ctoonId: true, userId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  if (minted.length === 0) {
    console.log('ℹ️ No minted UserCtoons found for the provided ctoonIds. Nothing to do.')
    return
  }

  // 3) Filter to "owner is null"
  const orphans = minted.filter(m => m.userId == null)

  console.log(
    `Found ${minted.length} minted entries for target ctoonIds; ` +
    `${orphans.length} without an owner.`
  )

  if (orphans.length === 0) {
    console.log('✅ No orphaned entries to fix.')
    return
  }

  // 4) Assign each orphan to the target user
  for (const row of orphans) {
    await prisma.userCtoon.update({
      where: { id: row.id },
      data: { userId: targetUser.id },
    })
    console.log(`➡️  Reassigned UserCtoon ${row.id} (ctoonId ${row.ctoonId}) to ${targetUser.username}`)
  }

  console.log('🎉 Done reassigning orphaned cToons!')
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
