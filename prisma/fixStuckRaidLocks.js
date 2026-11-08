// prisma/fixStuckRaidLocks.js
//
// Finds CMoonEnemyRaidParticipant rows whose activeUserId sentinel ("at most one active raid per
// user" — see that column's own schema comment) is still set even though the raid it belongs to
// is long past any plausible live duration, and clears it.
//
// Root cause this cleans up after: server/utils/cmoonRaidSocket.js's sweep() had a FORMING-raid
// branch (solo queueing disabled, raid alone with just its leader) that re-armed the join window
// forever with no upper bound and no socket 'disconnect' handler anywhere in that module to catch
// a leader whose tab simply closed. That leaves the raid's lone participant row's activeUserId
// stuck set forever — which 409s every future join/start attempt of theirs with "You are already
// in a raid" (a P2002 on this column's own unique constraint), even from a clean server restart,
// since nothing in the DB ever told them otherwise. A matching code fix (SOLO_FORMING_ABANDON_MS
// in cmoonRaidSocket.js) stops this from recurring going forward; this script is for whatever is
// ALREADY stuck in the database from before that fix landed.
//
// A row is "stuck" here if activeUserId is set and its raid's startedAt is more than
// STALE_HOURS old — generous well beyond both the FORMING window (60s, repeatedly re-armable
// before the fix) and IN_PROGRESS combat's own round-limit/AFK-kick self-resolution (which
// completes in minutes), so nothing that's still plausibly a live raid is ever touched.
//
// What --apply does: sets activeUserId to null on each stuck row. Nothing else is touched — the
// raid's own status/outcome/roundLog are left exactly as they are, same as a normal resolution
// only ever touches this one column for this purpose.
//
// Idempotent: re-running finds nothing once the offenders are cleared.
//
// Usage:
//   node prisma/fixStuckRaidLocks.js            (dry-run, no changes)
//   node prisma/fixStuckRaidLocks.js --apply    (clear the stuck locks)

import dotenv from 'dotenv'
dotenv.config()

import { prisma } from '../server/prisma.js'

const APPLY = process.argv.includes('--apply')
const LOG = '[fixStuckRaidLocks]'
const STALE_HOURS = 2
const staleBefore = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000)

async function main() {
  const stuck = await prisma.cMoonEnemyRaidParticipant.findMany({
    where: {
      activeUserId: { not: null },
      raid: { startedAt: { lt: staleBefore } },
    },
    select: {
      id: true, userId: true, raidId: true,
      user: { select: { username: true } },
      raid: { select: { status: true, startedAt: true } },
    },
  })

  if (!stuck.length) {
    console.log(`${LOG} No stuck raid locks found.`)
    return
  }

  console.log(`${LOG} Found ${stuck.length} stuck raid lock(s):`)
  for (const row of stuck) {
    console.log(`${LOG}   ${row.user?.username ?? row.userId} — raid ${row.raidId} (status ${row.raid.status}, started ${row.raid.startedAt.toISOString()})`)
  }

  if (!APPLY) {
    console.log(`${LOG} dry-run complete. Use --apply to clear these locks.`)
    return
  }

  const { count } = await prisma.cMoonEnemyRaidParticipant.updateMany({
    where: { id: { in: stuck.map(r => r.id) } },
    data: { activeUserId: null },
  })
  console.log(`${LOG} cleared ${count} stuck raid lock(s).`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  .catch(async err => {
    console.error(`${LOG} failed:`, err)
    await prisma.$disconnect().catch(() => {})
    process.exit(1)
  })
