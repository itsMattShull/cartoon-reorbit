// server/api/discord/interactions.post.js
import { defineEventHandler, getRequestHeader, createError, readRawBody } from 'h3'
import nacl from 'tweetnacl'
import { prisma as db } from '@/server/prisma'
import { isCorrectRiddleAnswer } from '@/server/utils/cmoonRiddleAnswer'
import { claimCMoonRiddleSolve, getOpenWeeklyRiddle, getOpenBossLoreRiddles } from '@/server/utils/cmoonRiddle'
import { isCorrectHuntAnswer, getOpenCMoonHuntsForCMoon, claimCMoonHuntCompletion } from '@/server/utils/cmoonHunt'

const hex2bin = (hex) => Uint8Array.from(Buffer.from(hex, 'hex'))

export default defineEventHandler(async (event) => {
  const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY
  if (!PUBLIC_KEY) throw createError({ statusCode: 500, statusMessage: 'Missing DISCORD_PUBLIC_KEY' })

  // — Verify signature
  const signature = getRequestHeader(event, 'x-signature-ed25519') || ''
  const timestamp = getRequestHeader(event, 'x-signature-timestamp') || ''
  const bodyRaw = await readRawBody(event, 'utf8')
  const ok = nacl.sign.detached.verify(
    Buffer.from(timestamp + bodyRaw),
    hex2bin(signature),
    hex2bin(PUBLIC_KEY)
  )
  if (!ok) throw createError({ statusCode: 401, statusMessage: 'Bad signature' })

  const interaction = JSON.parse(bodyRaw)

  // — PING
  if (interaction.type === 1) return { type: 1 }

  // — Slash commands
  if (interaction.type === 2) {
    const cmd = interaction.data?.name
    if (cmd === 'czone' || cmd === 'trade') {
      // USER option is required
      const option = interaction.data.options?.find(o => o.name === 'user')
      const userId = option?.value
      const resolvedUser   = interaction.data.resolved?.users?.[userId]
      const resolvedMember = interaction.data.resolved?.members?.[userId]  // has .nick in guilds

      if (!resolvedUser) {
        return { type: 4, data: { content: 'User not found.', flags: 64 } }
      }

      // 1) pick display in order: guild nickname → global display name → username
      let display =
        resolvedMember?.nick ||
        resolvedUser.global_name ||
        resolvedUser.username || ''

      // 2) sanitize: strip diacritics, preserve case, allow [A-Za-z0-9._-], spaces → '-'
      display = display
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^A-Za-z0-9._-]/g, '')

      if (!display) {
        return { type: 4, data: { content: 'Name is empty after sanitizing.', flags: 64 } }
      }

      // Both of these used to be top-level routes. They now live under /newsite,
      // and the trade page takes the target as a query param rather than a path
      // segment, so the link is built per command instead of by concatenation.
      const link =
        cmd === 'czone'
          ? `https://www.cartoonreorbit.com/newsite/czone/${display}`
          : `https://www.cartoonreorbit.com/newsite/trade?username=${encodeURIComponent(display)}`

      return { type: 4, data: { content: link, flags: 64 } }
    }

    if (cmd === 'riddle') {
      // Guild context puts the caller under interaction.member.user; a DM puts it directly under
      // interaction.user (no `member` at all) — same two shapes czone/trade would see, just
      // neither of them needed the id itself before now.
      const discordId = interaction.member?.user?.id || interaction.user?.id || null
      const answer = interaction.data.options?.find(o => o.name === 'answer')?.value ?? ''

      if (!discordId) {
        return { type: 4, data: { content: 'Could not identify your Discord account.', flags: 64 } }
      }

      const user = await db.user.findUnique({ where: { discordId }, select: { id: true, cMoonId: true } })
      if (!user) {
        return { type: 4, data: { content: "You need a Cartoon ReOrbit account linked to this Discord account first.", flags: 64 } }
      }
      if (!user.cMoonId) {
        return { type: 4, data: { content: 'Join a cMoon team on the site before answering riddles.', flags: 64 } }
      }

      // A player typing an answer has no way to say WHICH riddle they mean, so every currently
      // open one — the weekly broadcast plus any boss-lore gate(s) — is checked against the
      // submitted text; whichever one it matches (if any) is the one claimed.
      const [weeklyRiddle, bossLoreRiddles] = await Promise.all([
        getOpenWeeklyRiddle(db),
        getOpenBossLoreRiddles(db),
      ])
      const openRiddles = [weeklyRiddle, ...bossLoreRiddles].filter(Boolean)
      if (!openRiddles.length) {
        return { type: 4, data: { content: "There's no riddle open right now — check back later!", flags: 64 } }
      }

      const matched = openRiddles.find(r => isCorrectRiddleAnswer(r, answer))
      if (!matched) {
        return { type: 4, data: { content: 'Not quite — try again!', flags: 64 } }
      }

      const result = await claimCMoonRiddleSolve(db, { riddleId: matched.id, userId: user.id, cMoonId: user.cMoonId })
      if (!result.claimed) {
        return { type: 4, data: { content: "Correct, but someone already solved this one first!", flags: 64 } }
      }
      const pointsLine = result.pointsAwarded > 0 ? ` Your cMoon earns ${result.pointsAwarded} points.` : ''
      const unlockLine = matched.kind === 'BOSS_LORE' ? ' The raid boss is now unlocked!' : ''
      return { type: 4, data: { content: `🎉 Correct — you solved it first!${pointsLine}${unlockLine}`, flags: 64 } }
    }

    if (cmd === 'hunt') {
      const discordId = interaction.member?.user?.id || interaction.user?.id || null
      const answer = interaction.data.options?.find(o => o.name === 'answer')?.value ?? ''

      if (!discordId) {
        return { type: 4, data: { content: 'Could not identify your Discord account.', flags: 64 } }
      }

      const user = await db.user.findUnique({ where: { discordId }, select: { id: true, cMoonId: true } })
      if (!user) {
        return { type: 4, data: { content: "You need a Cartoon ReOrbit account linked to this Discord account first.", flags: 64 } }
      }
      if (!user.cMoonId) {
        return { type: 4, data: { content: 'Join a cMoon team on the site before submitting a scavenger hunt answer.', flags: 64 } }
      }

      // Scoped to THIS player's own cMoon — unlike /riddle, a hunt isn't a single global race:
      // every cMoon runs the same hunt independently and completes it on its own.
      const openHunts = await getOpenCMoonHuntsForCMoon(db, user.cMoonId)
      if (!openHunts.length) {
        return { type: 4, data: { content: "There's no scavenger hunt open for your team right now.", flags: 64 } }
      }

      const matched = openHunts.find(h => isCorrectHuntAnswer(h, answer))
      if (!matched) {
        return { type: 4, data: { content: 'Not quite — try again!', flags: 64 } }
      }

      const result = await claimCMoonHuntCompletion(db, { huntId: matched.id, userId: user.id, cMoonId: user.cMoonId })
      if (!result.claimed) {
        return { type: 4, data: { content: 'Your team already completed this hunt!', flags: 64 } }
      }
      const pointsLine = result.pointsAwarded > 0 ? ` Your cMoon earns ${result.pointsAwarded} points.` : ''
      return { type: 4, data: { content: `🎉 Correct — your team solved the scavenger hunt!${pointsLine}`, flags: 64 } }
    }
  }

  // — Not handled
  return { type: 4, data: { content: 'Unsupported interaction.', flags: 64 } }
})
