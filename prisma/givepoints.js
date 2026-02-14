import { prisma } from '../server/prisma.js'

const AWARDS = {
  first: 10_000,
  secondThird: 5_000,
  fourthToEighth: 3_500,
  participation: 2_000
}
const BATCH_SIZE = 100 // adjust if you have lots of users

const APPLY = process.argv.includes('--apply')
const DRY_RUN = !APPLY

function pointsForPlace(place) {
  if (place === 1) return AWARDS.first
  if (place === 2 || place === 3) return AWARDS.secondThird
  if (place >= 4 && place <= 8) return AWARDS.fourthToEighth
  return AWARDS.participation
}

async function awardToUser({ userId, username, place, points, tournamentName }) {
  if (DRY_RUN) {
    console.log(
      `[DRY RUN] ${username} (${userId}) place=${place ?? 'n/a'} -> +${points.toLocaleString()}`
    )
    return
  }

  const updated = await prisma.userPoints.upsert({
    where: { userId },
    update: { points: { increment: points } },
    create: { userId, points }
  })

  const placeLabel = place ? `place ${place}` : 'opted-in'
  try {
    await prisma.pointsLog.create({
      data: {
        userId,
        points,
        total: updated.points,
        method: `gToons Clash Tournament: ${tournamentName} (${placeLabel})`,
        direction: 'increase'
      }
    })
  } catch (e) {
    if (e?.code !== 'P2021') { // unknown table
      console.warn(`pointsLog write failed for ${username}:`, e)
    }
  }

  console.log(
    `Awarded ${points.toLocaleString()} points to ${username}. ` +
    `New total: ${updated.points.toLocaleString()}.`
  )
}

async function main() {
  const tournament = await prisma.gtoonTournament.findFirst({
    where: { status: 'COMPLETE' },
    orderBy: { tournamentCompletedAt: 'desc' },
    select: {
      id: true,
      name: true,
      tournamentCompletedAt: true,
      finalPlacementsJson: true
    }
  })

  if (!tournament) {
    console.error('No completed gToons Clash tournaments found.')
    process.exit(1)
  }

  if (!Array.isArray(tournament.finalPlacementsJson)) {
    console.error(`Tournament ${tournament.name} is missing finalPlacementsJson.`)
    process.exit(1)
  }

  const placeByUserId = new Map()
  for (const entry of tournament.finalPlacementsJson) {
    if (!entry?.userId || !entry?.place) continue
    if (!placeByUserId.has(entry.userId)) {
      placeByUserId.set(entry.userId, entry.place)
    }
  }

  const optIns = await prisma.gtoonTournamentOptIn.findMany({
    where: { tournamentId: tournament.id, isActive: true },
    select: { userId: true, user: { select: { username: true } } },
    orderBy: { optedInAt: 'asc' }
  })

  if (!optIns.length) {
    console.error(`No active opt-ins found for ${tournament.name}.`)
    process.exit(1)
  }

  const awards = optIns.map(optIn => {
    const place = placeByUserId.get(optIn.userId)
    const points = pointsForPlace(place)
    return {
      userId: optIn.userId,
      username: optIn.user?.username || 'Unknown',
      place,
      points
    }
  })

  const summary = awards.reduce((acc, entry) => {
    const bucket = entry.place === 1
      ? '1st'
      : entry.place === 2 || entry.place === 3
        ? '2nd/3rd'
        : entry.place >= 4 && entry.place <= 8
          ? '4th-8th'
          : 'Opted-in'
    acc[bucket] = (acc[bucket] || 0) + 1
    return acc
  }, {})

  console.log(`Tournament: ${tournament.name}`)
  console.log(`Completed: ${tournament.tournamentCompletedAt?.toISOString() || 'n/a'}`)
  console.log(`Opt-ins: ${optIns.length}`)
  console.log(`Buckets: ${JSON.stringify(summary)}`)
  console.log(DRY_RUN ? 'Dry run only. Use --apply to grant points.' : 'Applying point grants...')

  for (let i = 0; i < awards.length; i += BATCH_SIZE) {
    const batch = awards.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(entry =>
        awardToUser({
          userId: entry.userId,
          username: entry.username,
          place: entry.place,
          points: entry.points,
          tournamentName: tournament.name
        })
      )
    )
    console.log(`Processed ${Math.min(i + BATCH_SIZE, awards.length)} / ${awards.length}`)
  }

  console.log('Done.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => {})
