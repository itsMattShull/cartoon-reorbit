// prisma/grantAchievementsToUsers.js
// Grants all existing achievements to a fixed set of users by username,
// setting achievedAt to a specified date.
//
// Inspired by prisma/deleteCtoon.js for structure and prisma import.

import { prisma } from '../server/prisma.js'

// Configure target usernames and achievedAt timestamp here
const TARGET_USERNAMES = [
  'SuperSharkSlayer',
  'AwesomeHackerAgent',
  'ShadowNinjaAce',
  'ChillNomadMystic',
  'PrismaticAngelQueen',
  'BraveCheetahAthlete',
  'QuirkyDJSuperstar',
]

// Midnight UTC on 2025-12-20
const ACHIEVED_AT = new Date('2025-12-20T00:00:00.000Z')

async function main() {
  try {
    console.log('[grant-achievements] Fetching target users…')
    const users = await prisma.user.findMany({
      where: { username: { in: TARGET_USERNAMES } },
      select: { id: true, username: true }
    })

    const foundUsernames = new Set(users.map(u => u.username))
    const missing = TARGET_USERNAMES.filter(u => !foundUsernames.has(u))
    if (missing.length) {
      console.warn('[grant-achievements] Warning: some usernames not found:', missing)
    }
    if (users.length === 0) {
      console.log('[grant-achievements] No target users found. Exiting.')
      return
    }

    console.log('[grant-achievements] Loading all achievements…')
    const achievements = await prisma.achievement.findMany({ select: { id: true, slug: true, isActive: true } })
    if (achievements.length === 0) {
      console.log('[grant-achievements] No achievements exist. Exiting.')
      return
    }

    console.log(`[grant-achievements] Granting ${achievements.length} achievements to ${users.length} users…`)

    // For each user, create missing AchievementUser rows with the fixed achievedAt
    for (const user of users) {
      const rows = achievements.map(a => ({
        userId: user.id,
        achievementId: a.id,
        achievedAt: ACHIEVED_AT,
      }))
      try {
        const res = await prisma.achievementUser.createMany({ data: rows, skipDuplicates: true })
        console.log(`[grant-achievements] ${user.username}: inserted ${res.count} (duplicates skipped)`) // count may be undefined on some drivers; safe to log
      } catch (err) {
        console.error(`[grant-achievements] Failed for ${user.username}:`, err?.message || err)
      }
    }

    console.log('[grant-achievements] Done.')
  } catch (err) {
    console.error('[grant-achievements] Error:', err)
  }
}

main()

