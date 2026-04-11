// prisma/restore-pokemon-ctoons-to-prev-owners.js
//
// Finds Pokemon series cToons currently owned by CartoonReOrbitOfficial
// that passed through ZenVikingGuru's hands, then restores each one to
// the peer who owned it immediately before ZenVikingGuru did.
//
// After applying, sends each affected user a Discord DM listing the
// cToons that were returned to them (errors are silently ignored).
//
// Usage:
//   node prisma/restore-pokemon-ctoons-to-prev-owners.js            (dry-run, no changes)
//   node prisma/restore-pokemon-ctoons-to-prev-owners.js --apply    (apply changes + send DMs)

import dotenv from 'dotenv'
dotenv.config()

import { prisma } from '../server/prisma.js'

const APPLY = process.argv.includes('--apply')

const ZEN_USERNAME      = 'ZenVikingGuru'
const OFFICIAL_USERNAME = 'CartoonReOrbitOfficial'
const POKEMON_SERIES    = 'Pokemon'

// ── Discord helpers (mirrors sendDiscordDMByDiscordId in server/utils/discord.js) ──

const DISCORD_API_BASE = 'https://discord.com/api/v10'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function openDmChannel(discordId) {
  const BOT_TOKEN = process.env.BOT_TOKEN
  if (!BOT_TOKEN || !discordId) return null

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${DISCORD_API_BASE}/users/@me/channels`, {
        method:  'POST',
        headers: { Authorization: BOT_TOKEN, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ recipient_id: discordId }),
      })
      if (res.status === 429) {
        let body = { retry_after: 5 }
        try { body = await res.json() } catch {}
        await sleep(Math.ceil((body.retry_after || 5) * 1000))
        continue
      }
      if (!res.ok) return null
      const ch = await res.json()
      return ch?.id || null
    } catch {
      return null
    }
  }
  return null
}

async function sendDiscordDM(discordId, content) {
  const BOT_TOKEN = process.env.BOT_TOKEN
  if (!BOT_TOKEN || !discordId) return false

  const channelId = await openDmChannel(discordId)
  if (!channelId) return false

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
        method:  'POST',
        headers: { Authorization: BOT_TOKEN, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content }),
      })
      if (res.status === 429) {
        let body = { retry_after: 5 }
        try { body = await res.json() } catch {}
        await sleep(Math.ceil((body.retry_after || 5) * 1000))
        continue
      }
      if (!res.ok) return false
      return true
    } catch {
      return false
    }
  }
  return false
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function sep(label) {
  const line = '━'.repeat(62)
  console.log(`\n${line}`)
  if (label) console.log(label)
  console.log(line)
}

function mintLabel(mintNumber) {
  return mintNumber != null ? ` (Mint #${mintNumber})` : ''
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Restore Pokemon cToons to Previous Owners ===')
  console.log(`Mode: ${APPLY ? '** APPLY — changes will be written **' : 'DRY RUN — no changes'}`)

  // ── 1. Resolve key users ──────────────────────────────────────────────────

  const users = await prisma.user.findMany({
    where:  { username: { in: [ZEN_USERNAME, OFFICIAL_USERNAME] } },
    select: { id: true, username: true },
  })
  const idByName = new Map(users.map((u) => [u.username, u.id]))

  const missing = [ZEN_USERNAME, OFFICIAL_USERNAME].filter((n) => !idByName.has(n))
  if (missing.length) throw new Error(`Unknown username(s): ${missing.join(', ')}`)

  const zenId      = idByName.get(ZEN_USERNAME)
  const officialId = idByName.get(OFFICIAL_USERNAME)

  // ── 2. Find Pokemon cToons currently owned by CartoonReOrbitOfficial ──────

  const officialPokemonCtoons = await prisma.userCtoon.findMany({
    where: {
      userId:   officialId,
      burnedAt: null,
      ctoon:    { series: POKEMON_SERIES },
    },
    select: {
      id:        true,
      ctoonId:   true,
      mintNumber: true,
      ctoon:     { select: { name: true, series: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log(
    `\nFound ${officialPokemonCtoons.length} active Pokemon cToon(s) owned by ${OFFICIAL_USERNAME}`,
  )

  if (!officialPokemonCtoons.length) {
    console.log('Nothing to do.\n')
    return
  }

  // ── 3. For each, inspect owner logs to find the peer before ZenVikingGuru ─

  // restorations: the cToons we can fix
  // skipped: cToons we cannot (with reason)
  const restorations = []
  const skipped      = []

  for (const uc of officialPokemonCtoons) {
    // All ownership-transfer log entries for this specific UserCtoon, oldest first
    const logs = await prisma.ctoonOwnerLog.findMany({
      where:   { userCtoonId: uc.id },
      orderBy: { createdAt: 'asc' },
      select:  { id: true, userId: true, createdAt: true },
    })

    // Find ZenVikingGuru's entry in the log
    const zenIdx = logs.findIndex((l) => l.userId === zenId)

    if (zenIdx === -1) {
      skipped.push({ uc, reason: 'No ZenVikingGuru entry in owner logs' })
      continue
    }
    if (zenIdx === 0) {
      skipped.push({ uc, reason: 'ZenVikingGuru is the earliest log entry — no prior owner recorded' })
      continue
    }

    const prevLog    = logs[zenIdx - 1]
    const prevUserId = prevLog.userId

    if (!prevUserId) {
      skipped.push({ uc, reason: 'Log entry immediately before ZenVikingGuru has a null userId' })
      continue
    }

    // Resolve the previous owner's full record
    const prevUser = await prisma.user.findUnique({
      where:  { id: prevUserId },
      select: { id: true, username: true, discordId: true },
    })

    if (!prevUser) {
      skipped.push({ uc, reason: `Cannot resolve user for id ${prevUserId}` })
      continue
    }

    restorations.push({
      userCtoonId:   uc.id,
      ctoonId:       uc.ctoonId,
      ctoonName:     uc.ctoon.name,
      mintNumber:    uc.mintNumber,
      prevUserId:    prevUser.id,
      prevUsername:  prevUser.username,
      prevDiscordId: prevUser.discordId,
    })
  }

  // ── 4. Print report ───────────────────────────────────────────────────────

  sep('RESTORATIONS PLANNED')

  if (restorations.length) {
    for (const r of restorations) {
      console.log(`  ${r.ctoonName}${mintLabel(r.mintNumber)}  →  ${r.prevUsername}`)
    }
  } else {
    console.log('  (none — see skipped items below)')
  }

  if (skipped.length) {
    sep('SKIPPED')
    for (const { uc, reason } of skipped) {
      console.log(`  ${uc.ctoon.name}${mintLabel(uc.mintNumber)}  —  ${reason}`)
    }
  }

  // Group planned restorations by target user (for DM sending later)
  const byUser = new Map() // prevUserId → { username, discordId, ctoons: [] }
  for (const r of restorations) {
    if (!byUser.has(r.prevUserId)) {
      byUser.set(r.prevUserId, { username: r.prevUsername, discordId: r.prevDiscordId, ctoons: [] })
    }
    byUser.get(r.prevUserId).ctoons.push(r)
  }

  sep('SUMMARY')
  console.log(`  Pokemon cToons to restore : ${restorations.length}`)
  console.log(`  Skipped                   : ${skipped.length}`)
  console.log(`  Unique target users       : ${byUser.size}`)

  if (!APPLY) {
    console.log('\n  (Run with --apply to apply all changes above)\n')
    return
  }

  // ── 5. Apply ownership changes ────────────────────────────────────────────

  sep('APPLYING CHANGES')

  let restored = 0
  for (const r of restorations) {
    try {
      await prisma.$transaction(async (tx) => {
        // Transfer ownership back to the previous owner
        await tx.userCtoon.update({
          where: { id: r.userCtoonId },
          data:  { userId: r.prevUserId, isTradeable: true },
        })

        // Drop any stale trade-list entries that belonged to other users
        await tx.userTradeListItem.deleteMany({
          where: { userCtoonId: r.userCtoonId, userId: { not: r.prevUserId } },
        })

        // Record the ownership change in the log
        await tx.ctoonOwnerLog.create({
          data: {
            userId:      r.prevUserId,
            ctoonId:     r.ctoonId,
            userCtoonId: r.userCtoonId,
            mintNumber:  r.mintNumber,
          },
        })
      })

      console.log(`  ✓ ${r.ctoonName}${mintLabel(r.mintNumber)}  →  ${r.prevUsername}`)
      restored++
    } catch (err) {
      console.error(`  ✗ Failed to restore ${r.ctoonName}${mintLabel(r.mintNumber)}: ${err.message}`)
    }
  }

  console.log(`\n  Restored ${restored} / ${restorations.length} cToon(s)`)

  // ── 6. Send Discord DMs to each unique affected user ─────────────────────

  sep('SENDING DISCORD DMs')

  for (const [, info] of byUser) {
    if (!info.discordId) {
      console.log(`  ⚠ ${info.username} — no Discord ID on record, skipping DM`)
      continue
    }

    const lines = [
      `🎉 Good news! Your Pokemon touch trace cToon(s) have been given back to you:`,
      ...info.ctoons.map((r) => `  • ${r.ctoonName}${mintLabel(r.mintNumber)}`),
      ``,
      `They should now appear in your collection. Enjoy!`,
    ]

    try {
      const ok = await sendDiscordDM(info.discordId, lines.join('\n'))
      if (ok) {
        console.log(`  ✓ DM sent to ${info.username}`)
      } else {
        console.log(`  ⚠ DM could not be delivered to ${info.username} (ignored)`)
      }
    } catch {
      console.log(`  ⚠ DM errored for ${info.username} (ignored)`)
    }
  }

  console.log('\n  Done.\n')
}

main()
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
