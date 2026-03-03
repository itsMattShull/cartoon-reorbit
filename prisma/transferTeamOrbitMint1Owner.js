import 'dotenv/config'
import { prisma } from '../server/prisma.js'

const FROM_USERNAME = 'DragonGolemMaster'
const TO_USERNAME = 'AwesomeHackerAgent'
const CTOON_NAME_MATCH = 'Team Orbit'
const MINT_NUMBER = 1

async function main() {
  const users = await prisma.user.findMany({
    where: { username: { in: [FROM_USERNAME, TO_USERNAME] } },
    select: { id: true, username: true }
  })

  const userByUsername = new Map(users.map((u) => [u.username, u]))
  const fromUser = userByUsername.get(FROM_USERNAME)
  const toUser = userByUsername.get(TO_USERNAME)

  if (!fromUser || !toUser) {
    const missing = [FROM_USERNAME, TO_USERNAME].filter((u) => !userByUsername.has(u))
    throw new Error(`Missing user(s): ${missing.join(', ')}`)
  }

  const matches = await prisma.userCtoon.findMany({
    where: {
      userId: fromUser.id,
      mintNumber: MINT_NUMBER,
      burnedAt: null,
      ctoon: {
        name: {
          contains: CTOON_NAME_MATCH,
          mode: 'insensitive'
        }
      }
    },
    select: {
      id: true,
      ctoonId: true,
      mintNumber: true,
      ctoon: { select: { name: true } }
    }
  })

  if (matches.length === 0) {
    throw new Error(
      `No active UserCtoon found for ${FROM_USERNAME} with mint #${MINT_NUMBER} and ctoon name containing "${CTOON_NAME_MATCH}".`
    )
  }

  if (matches.length > 1) {
    console.error('Multiple matches found. Refine CTOON_NAME_MATCH before proceeding:')
    for (const row of matches) {
      console.error(`- userCtoonId=${row.id}, ctoonId=${row.ctoonId}, name="${row.ctoon.name}", mint=${row.mintNumber}`)
    }
    throw new Error('Aborting due to ambiguous match.')
  }

  const target = matches[0]

  await prisma.userCtoon.update({
    where: { id: target.id },
    data: { userId: toUser.id }
  })

  console.log(
    `Transferred userCtoonId=${target.id} ("${target.ctoon.name}" mint #${target.mintNumber}) from ${FROM_USERNAME} to ${TO_USERNAME}.`
  )
}

main()
  .catch((err) => {
    console.error('Transfer failed:', err?.message || err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
