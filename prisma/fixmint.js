// server/scripts/assign-orphaned-ctoones.js
// Usage:
//   DATABASE_URL="postgres://..." node server/scripts/assign-orphaned-ctoones.js
//
// What it does:
//  - Finds minted UserCtoons for the two specified ctoonIds
//  - Reassigns any with no owner (userId == NULL) to "CartoonReOrbitOfficial"
//  - Reassigns any whose current owner's username is missing (NULL or empty) to "CartoonReOrbitOfficial"

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
    throw new Error(`❌ No user found with username "${TARGET_USERNAME}". Aborting.`)
  }
  console.log(`👤 Assigning to: ${targetUser.username} (${targetUser.id})`)

  // 2) Load all minted entries for the target ctoonIds (with current owner info)
  const minted = await prisma.userCtoon.findMany({
    where: { ctoonId: { in: TARGET_CTOON_IDS } },
    select: {
      id: true,
      ctoonId: true,
      userId: true,
      createdAt: true,
      user: { select: { id: true, username: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (minted.length === 0) {
    console.log('ℹ️ No minted UserCtoons found for the provided ctoonIds. Nothing to do.')
    return
  }

  // 3) Determine which rows need reassignment
  const needsReassign = minted.filter((m) => {
    // Case A: truly orphaned (no owner)
    if (!m.userId) return true

    // Case B: owner exists but has no username (null/empty/whitespace)
    const uname = m.user?.username
    const hasNoUsername = typeof uname !== 'string' || uname.trim().length === 0

    // Skip if it's already owned by target user (even if no username—shouldn't happen—but safe)
    const alreadyTarget = m.userId === targetUser.id

    return hasNoUsername && !alreadyTarget
  })

  console.log(
    `Found ${minted.length} minted entries for target ctoonIds; ` +
    `${needsReassign.length} need reassignment (no owner or owner without username).`
  )

  if (needsReassign.length === 0) {
    console.log('✅ Nothing to reassign.')
    return
  }

  // 4) Reassign
  const ops = needsReassign.map((row) =>
    prisma.userCtoon.update({
      where: { id: row.id },
      data: { userId: targetUser.id },
    })
  )

  await prisma.$transaction(ops)

  // 5) Logging
  for (const row of needsReassign) {
    const reason = !row.userId
      ? 'no owner'
      : `owner username missing (${row.user?.id ?? 'unknown user id'})`
    console.log(`➡️  Reassigned UserCtoon ${row.id} (ctoonId ${row.ctoonId}) to ${targetUser.username} — reason: ${reason}`)
  }

  console.log('🎉 Done reassigning cToons without valid usernames!')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
