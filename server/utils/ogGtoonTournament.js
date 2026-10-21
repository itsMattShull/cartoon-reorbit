// server/utils/ogGtoonTournament.js
//
// Orchestration for OG gToons tournaments: opt-in window -> Swiss (4+ rounds) then a Top 8
// bracket, or a straight single-elimination bracket for 8 or fewer entrants. EVERY pairing is a
// best-of-3 of dedicated, zero-stake games (see ogGtoonsTournamentSocket.js), played from a deck
// locked at opt-in. The rules themselves live in the pure tournamentCore.js; this file is the
// Prisma-bound caller that runs from the cron worker and the REST handlers — never the socket
// process (that only uses ogGtoonTournamentLive.js).
//
// ── How a result gets in ────────────────────────────────────────────────────────────────────
//   1. A game ends -> the socket server writes OgGtoonMatch (tournamentMatchId set) and queues an
//      'ogTournamentAdvance' job.
//   2. The worker scores the series (settleMatchFromGames), and once a round is complete builds
//      the next one (advanceTournament) and sends the DMs.
//   3. The 15-minute cron repeats all of it as a safety net, enforces deadlines, sends reminders
//      and pays prizes. Every step is idempotent: a pairing's `lockedAt` is authoritative (a game
//      finishing after an admin or deadline decision never overturns it), advanceTournament holds
//      a row lock on the tournament, and rounds/tables are unique in the database.
import { DateTime } from 'luxon'
import { randomBytes } from 'node:crypto'
import { sendDiscordDMByDiscordId, sendGuildChannelMessageById } from './discord.js'
import { grantRewardInTx, enqueueCtoonJobs } from './achievements.js'
import { hasFlag, setFlag } from './cache.js'
import {
  BEST_OF, WINS_NEEDED, formatFor, swissRoundsFor, compareStandings, seededShuffle, bracketSizeFor,
  buildBracketSeedPairs, bracketRoundLabel, pairSwissRound, pairKey, decideAtDeadline,
  computeRecords, buildFinalPlacements, prizeRecipients, roundDueAt
} from './tournamentCore.js'
import {
  ACTIVE_STATUSES, settleMatchFromGames, loadSeriesGames, clearStaleLive, isFresh, loadLockedDeckForGame
} from './ogGtoonTournamentLive.js'

const CENTRAL_TZ = 'America/Chicago'
const ANNOUNCE_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000
const HOUR = 3600 * 1000

function baseUrl() {
  return process.env.PUBLIC_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://www.cartoonreorbit.com' : 'http://localhost:3000')
}
export function getOgTournamentUrl(tournamentId) {
  return `${baseUrl()}/newsite/gtoons-classic?tab=tournaments&t=${tournamentId}`
}
export function formatCentral(date) {
  const dt = DateTime.fromJSDate(new Date(date)).setZone(CENTRAL_TZ)
  return dt.isValid ? dt.toFormat('LLL d, yyyy h:mm a ZZZ') : String(date)
}
function getCentralMidnight(date) {
  return DateTime.fromJSDate(date).setZone(CENTRAL_TZ).startOf('day').toUTC().toJSDate()
}

/** Runs `fn` over `items` with a small concurrency cap; one failure never stops the rest. */
async function runLimited(items, limit, fn) {
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const item = items[i++]
      try { await fn(item) } catch (err) { console.error('[ogTournament] notify failed:', err?.message || err) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/* ── Messages ────────────────────────────────────────────────────────────────────────────── */

export function stageLabel(stage, roundNumber, bracketMatchCount = null) {
  if (stage === 'SWISS') return `Swiss Round ${roundNumber}`
  return bracketMatchCount ? bracketRoundLabel(bracketMatchCount) : `Bracket Round ${roundNumber}`
}

async function dmUsers(db, items) {
  if (!items.length) return
  const ids = [...new Set(items.map(i => i.userId))]
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, discordId: true } })
  const discordById = new Map(users.map(u => [u.id, u.discordId]))
  await runLimited(items, 3, async ({ userId, text }) => {
    const discordId = discordById.get(userId)
    if (discordId) await sendDiscordDMByDiscordId(discordId, text)
  })
}

/** DMs both players of every real match in a freshly opened round. */
async function sendRoundOpenDMs(db, tournamentId, roundId) {
  const [tournament, round] = await Promise.all([
    db.ogGtoonTournament.findUnique({ where: { id: tournamentId } }),
    db.ogGtoonTournamentRound.findUnique({ where: { id: roundId } })
  ])
  if (!tournament || !round) return
  const matches = await db.ogGtoonTournamentMatch.findMany({
    where: { roundId, status: 'PENDING' },
    include: { playerA: { select: { id: true, username: true } }, playerB: { select: { id: true, username: true } } }
  })
  const label = stageLabel(round.stage, round.roundNumber, round.stage === 'BRACKET' ? matches.length : null)
  const link = getOgTournamentUrl(tournament.id)
  const due = round.dueAt ? `\n• Finish by: ${formatCentral(round.dueAt)}` : ''
  const items = []
  for (const m of matches) {
    const mk = (me, opp) => ({
      userId: me.id,
      text: [
        `🏆 ${tournament.name} — ${label}`,
        `You are paired with ${opp.username || 'your opponent'}.`,
        `• Best of 3 (first to 2 wins). Both of you need to be online to play.${due}`,
        `• Open the tournament and press Play: ${link}`
      ].join('\n')
    })
    items.push(mk(m.playerA, m.playerB), mk(m.playerB, m.playerA))
  }
  await dmUsers(db, items)
}

async function sendMatchDecidedDMs(db, match, tournament, reason) {
  const users = await db.user.findMany({ where: { id: { in: [match.playerAUserId, match.playerBUserId] } }, select: { id: true, username: true } })
  const name = new Map(users.map(u => [u.id, u.username]))
  const result = match.outcome === 'TIE'
    ? 'It was recorded as a draw.'
    : match.outcome == null
      ? 'It was recorded as a loss for both players.'
      : `${name.get(match.winnerUserId) || 'The winner'} advances with the win.`
  const items = [match.playerAUserId, match.playerBUserId].map(userId => ({
    userId,
    text: `🏆 ${tournament.name}: your match ${name.get(match.playerAUserId)} vs ${name.get(match.playerBUserId)} was decided (${reason}). ${result}\n${getOgTournamentUrl(tournament.id)}`
  }))
  await dmUsers(db, items)
}

/* ── Announcements (Discord channel) ─────────────────────────────────────────────────────── */

export async function sendOgTournamentAnnouncement(db, tournament) {
  const channelId = (tournament.announcementChannelId || '').trim() || process.env.DISCORD_ANNOUNCEMENT_CHANNEL
  const botToken = process.env.DISCORD_ANNOUNCEMENTS_BOT_TOKEN || process.env.BOT_TOKEN
  if (!channelId || !botToken) return false
  const optInCount = await db.ogGtoonTournamentOptIn.count({ where: { tournamentId: tournament.id, isActive: true } })
  const lines = [
    `🏆 ${tournament.name} — OG gToons Tournament`,
    `• Best of 3 · opt-in: ${formatCentral(tournament.optInStartAt)} → ${formatCentral(tournament.optInEndAt)} (${CENTRAL_TZ})`,
    `• Current opt-ins: ${optInCount}`,
    `• Lock in a deck and join: ${getOgTournamentUrl(tournament.id)}`
  ]
  return sendGuildChannelMessageById(channelId, lines.join('\n'), botToken)
}

export async function processAnnouncements(db, now = new Date()) {
  const tournaments = await db.ogGtoonTournament.findMany({ where: { status: 'OPT_IN_OPEN' } })
  for (const t of tournaments) {
    const midnight = getCentralMidnight(t.optInEndAt)
    if (!t.finalOptInMidnightAnnouncementSent && now >= midnight) {
      const claimed = await db.ogGtoonTournament.updateMany({
        where: { id: t.id, finalOptInMidnightAnnouncementSent: false },
        data: { finalOptInMidnightAnnouncementSent: true, lastAnnouncementAt: now }
      })
      if (claimed.count) await sendOgTournamentAnnouncement(db, t)
    }
    if (t.nextAnnouncementAt && now >= t.nextAnnouncementAt) {
      const candidate = new Date(t.nextAnnouncementAt.getTime() + ANNOUNCE_INTERVAL_MS)
      const claimed = await db.ogGtoonTournament.updateMany({
        where: { id: t.id, nextAnnouncementAt: t.nextAnnouncementAt },
        data: { lastAnnouncementAt: now, nextAnnouncementAt: candidate <= t.optInEndAt ? candidate : null }
      })
      if (claimed.count) await sendOgTournamentAnnouncement(db, t)
    }
  }
}

/* ── Records ─────────────────────────────────────────────────────────────────────────────── */

export async function recomputeRecords(db, tournamentId) {
  const optIns = await db.ogGtoonTournamentOptIn.findMany({ where: { tournamentId, isActive: true }, select: { userId: true } })
  const userIds = optIns.map(o => o.userId)
  if (!userIds.length) return
  const matches = await db.ogGtoonTournamentMatch.findMany({
    where: { tournamentId, status: { in: ['COMPLETE', 'BYE'] } },
    select: {
      stage: true, status: true, playerAUserId: true, playerBUserId: true, outcome: true,
      winnerUserId: true, winsA: true, winsB: true, ties: true
    }
  })
  const records = computeRecords(userIds, matches.filter(m => m.stage === 'SWISS'), matches.filter(m => m.stage === 'BRACKET'))
  const now = new Date()
  await db.ogGtoonTournamentPlayerRecord.createMany({
    data: userIds.map(userId => ({ tournamentId, userId })),
    skipDuplicates: true
  })
  for (const r of records.values()) {
    await db.ogGtoonTournamentPlayerRecord.updateMany({
      where: { tournamentId, userId: r.userId },
      data: {
        swissWins: r.swissWins, swissLosses: r.swissLosses, swissTies: r.swissTies, swissByes: r.swissByes,
        bracketWins: r.bracketWins, bracketLosses: r.bracketLosses, points: r.points,
        swissGameWins: r.swissGameWins, swissGameLosses: r.swissGameLosses, swissGameTies: r.swissGameTies,
        opponentMatchWinPct: r.opponentMatchWinPct, gameWinPct: r.gameWinPct, lastUpdatedAt: now
      }
    })
  }
}

/* ── Building rounds ─────────────────────────────────────────────────────────────────────── */

async function activePlayerIds(tx, tournamentId) {
  const optIns = await tx.ogGtoonTournamentOptIn.findMany({
    where: { tournamentId, isActive: true, disqualified: false },
    select: { userId: true }
  })
  return optIns.map(o => o.userId)
}

async function createRound(tx, tournament, stage, roundNumber, now) {
  return tx.ogGtoonTournamentRound.create({
    data: {
      tournamentId: tournament.id, stage, roundNumber, openedAt: now,
      dueAt: roundDueAt(now, tournament.roundWindowHours)
    }
  })
}

async function createSwissRound(tx, tournament, roundNumber, now) {
  const ids = await activePlayerIds(tx, tournament.id)
  let ordered
  if (roundNumber === 1) {
    // No standings yet: a seeded shuffle, so first-round pairings are random but reproducible.
    ordered = seededShuffle(ids, `${tournament.seedValue}:swiss:1`).map(userId => ({ userId, points: 0, swissByes: 0 }))
  } else {
    const records = await tx.ogGtoonTournamentPlayerRecord.findMany({
      where: { tournamentId: tournament.id, userId: { in: ids } },
      select: { userId: true, points: true, opponentMatchWinPct: true, gameWinPct: true, swissByes: true }
    })
    ordered = records.slice().sort(compareStandings)
  }

  const prior = await tx.ogGtoonTournamentMatch.findMany({
    where: { tournamentId: tournament.id, stage: 'SWISS', status: { in: ['COMPLETE', 'BYE'] } },
    select: { playerAUserId: true, playerBUserId: true }
  })
  const previousPairs = new Set(prior.filter(m => m.playerAUserId !== m.playerBUserId).map(m => pairKey(m.playerAUserId, m.playerBUserId)))
  const { pairs, byeUserId, rematches } = pairSwissRound(ordered, previousPairs)
  if (rematches) console.warn(`[ogTournament] ${tournament.id} round ${roundNumber}: ${rematches} unavoidable rematch(es)`)

  const round = await createRound(tx, tournament, 'SWISS', roundNumber, now)
  const rows = pairs.map(([a, b], i) => ({
    tournamentId: tournament.id, roundId: round.id, stage: 'SWISS', roundNumber, tableNumber: i + 1,
    playerAUserId: a, playerBUserId: b, status: 'PENDING', bestOf: BEST_OF, requiresWinner: false,
    pairedAt: now, dueAt: round.dueAt
  }))
  if (byeUserId) {
    rows.push({
      tournamentId: tournament.id, roundId: round.id, stage: 'SWISS', roundNumber, tableNumber: null,
      playerAUserId: byeUserId, playerBUserId: byeUserId, status: 'BYE', bestOf: BEST_OF,
      outcome: 'A_WIN', winnerUserId: byeUserId, requiresWinner: false, pairedAt: now,
      completedAt: now, lockedAt: now
    })
  }
  if (rows.length) await tx.ogGtoonTournamentMatch.createMany({ data: rows })
  return round
}

/** `pairs` are [seedA, seedB]; `seedMap` is seed -> userId. A missing seed is a bye for the other. */
async function createBracketRound(tx, tournament, roundNumber, pairs, seedMap, now) {
  const round = await createRound(tx, tournament, 'BRACKET', roundNumber, now)
  const rows = []
  let table = 1
  for (const [seedA, seedB] of pairs) {
    const a = seedMap.get(seedA) || null
    const b = seedMap.get(seedB) || null
    if (a && b) {
      rows.push({
        tournamentId: tournament.id, roundId: round.id, stage: 'BRACKET', roundNumber, tableNumber: table,
        playerAUserId: a, playerBUserId: b, status: 'PENDING', bestOf: BEST_OF, requiresWinner: true,
        pairedAt: now, dueAt: round.dueAt, seedA, seedB
      })
    } else if (a || b) {
      const w = a || b
      rows.push({
        tournamentId: tournament.id, roundId: round.id, stage: 'BRACKET', roundNumber, tableNumber: table,
        playerAUserId: w, playerBUserId: w, status: 'BYE', bestOf: BEST_OF, outcome: 'A_WIN',
        winnerUserId: w, requiresWinner: false, pairedAt: now, completedAt: now, lockedAt: now, seedA, seedB
      })
    }
    table += 1
  }
  if (rows.length) await tx.ogGtoonTournamentMatch.createMany({ data: rows })
  return round
}

async function createFirstBracket(tx, tournament, userIds, now) {
  const order = seededShuffle(userIds, `${tournament.seedValue}:bracket`)
  const seedMap = new Map(order.map((userId, idx) => [idx + 1, userId]))
  return createBracketRound(tx, tournament, 1, buildBracketSeedPairs(bracketSizeFor(order.length)), seedMap, now)
}

async function createTop8Bracket(tx, tournament, now) {
  const ids = await activePlayerIds(tx, tournament.id)
  const records = await tx.ogGtoonTournamentPlayerRecord.findMany({
    where: { tournamentId: tournament.id, userId: { in: ids } }
  })
  const top = records.slice().sort(compareStandings).slice(0, 8)
  if (top.length < 2) return null
  const seedMap = new Map(top.map((r, idx) => [idx + 1, r.userId]))
  return createBracketRound(tx, tournament, 1, buildBracketSeedPairs(bracketSizeFor(top.length)), seedMap, now)
}

/* ── State transitions (opt-in open / close) ─────────────────────────────────────────────── */

export async function processStateTransitions(db, now = new Date()) {
  const events = []

  const toOpen = await db.ogGtoonTournament.findMany({ where: { status: 'DRAFT', optInStartAt: { lte: now } } })
  for (const t of toOpen) {
    await db.ogGtoonTournament.updateMany({
      where: { id: t.id, status: 'DRAFT' },
      data: { status: 'OPT_IN_OPEN', nextAnnouncementAt: t.optInStartAt, lastAnnouncementAt: null, finalOptInMidnightAnnouncementSent: false }
    })
  }

  const toClose = await db.ogGtoonTournament.findMany({ where: { status: 'OPT_IN_OPEN', optInEndAt: { lte: now } } })
  for (const t of toClose) {
    let roundId = null
    await db.$transaction(async (tx) => {
      const closed = await tx.ogGtoonTournament.updateMany({
        where: { id: t.id, status: 'OPT_IN_OPEN' },
        data: { status: 'OPT_IN_CLOSED', nextAnnouncementAt: null }
      })
      if (!closed.count) return

      const optIns = await tx.ogGtoonTournamentOptIn.findMany({
        where: { tournamentId: t.id, isActive: true, disqualified: false },
        select: { id: true, userId: true, user: { select: { banned: true, active: true } } }
      })
      const bad = optIns.filter(o => o.user?.banned || o.user?.active === false)
      if (bad.length) {
        await tx.ogGtoonTournamentOptIn.updateMany({
          where: { id: { in: bad.map(o => o.id) } },
          data: { disqualified: true, disqualifiedNote: 'Account not in good standing when opt-in closed' }
        })
      }
      const good = optIns.filter(o => !bad.includes(o))
      await tx.ogGtoonTournamentPlayerRecord.createMany({
        data: good.map(o => ({ tournamentId: t.id, userId: o.userId })),
        skipDuplicates: true
      })

      if (good.length < 2) {
        await tx.ogGtoonTournament.update({ where: { id: t.id }, data: { status: 'CANCELLED' } })
        return
      }

      const seedValue = randomBytes(8).toString('hex')
      const format = formatFor(good.length)
      const fresh = { ...t, seedValue, roundWindowHours: t.roundWindowHours }
      if (format === 'BRACKET_8_OR_LESS') {
        await tx.ogGtoonTournament.update({ where: { id: t.id }, data: { status: 'BRACKET_ACTIVE', format, seedValue } })
        roundId = (await createFirstBracket(tx, fresh, good.map(o => o.userId), now)).id
      } else {
        const planned = swissRoundsFor(good.length, t.swissRoundsOverride)
        await tx.ogGtoonTournament.update({
          where: { id: t.id },
          data: { status: 'SWISS_ACTIVE', format, seedValue, swissRoundsPlanned: planned }
        })
        roundId = (await createSwissRound(tx, fresh, 1, now)).id
      }
    }, { timeout: 60000, maxWait: 10000 })
    if (roundId) events.push({ type: 'ROUND_OPEN', tournamentId: t.id, roundId })
  }
  return events
}

/* ── Advancing ───────────────────────────────────────────────────────────────────────────── */

async function stepSwiss(tx, t, now, events) {
  const current = await tx.ogGtoonTournamentRound.findFirst({
    where: { tournamentId: t.id, stage: 'SWISS' }, orderBy: { roundNumber: 'desc' }
  })
  if (!current) return false
  const open = await tx.ogGtoonTournamentMatch.count({
    where: { roundId: current.id, status: { notIn: ['COMPLETE', 'BYE'] } }
  })
  if (open > 0) return false

  await recomputeRecords(tx, t.id)
  const planned = t.swissRoundsPlanned || swissRoundsFor(0, t.swissRoundsOverride)
  if (current.roundNumber >= planned) {
    const hasBracket = await tx.ogGtoonTournamentRound.findFirst({ where: { tournamentId: t.id, stage: 'BRACKET' } })
    if (hasBracket) return false
    await tx.ogGtoonTournament.update({ where: { id: t.id }, data: { status: 'BRACKET_ACTIVE' } })
    const round = await createTop8Bracket(tx, { ...t }, now)
    if (round) events.push({ type: 'ROUND_OPEN', tournamentId: t.id, roundId: round.id })
    return true
  }
  const next = await createSwissRound(tx, t, current.roundNumber + 1, now)
  events.push({ type: 'ROUND_OPEN', tournamentId: t.id, roundId: next.id })
  return true
}

async function stepBracket(tx, t, now, events) {
  const last = await tx.ogGtoonTournamentRound.findFirst({
    where: { tournamentId: t.id, stage: 'BRACKET' }, orderBy: { roundNumber: 'desc' }
  })
  if (!last) return false
  const matches = await tx.ogGtoonTournamentMatch.findMany({
    where: { roundId: last.id }, orderBy: { tableNumber: 'asc' }
  })
  if (matches.some(m => !['COMPLETE', 'BYE'].includes(m.status))) return false

  if (matches.length <= 1) {
    await finishTournament(tx, t, now, events)
    return true
  }

  const seedByUser = new Map()
  const firstRound = await tx.ogGtoonTournamentMatch.findMany({
    where: { tournamentId: t.id, stage: 'BRACKET', roundNumber: 1 },
    select: { playerAUserId: true, playerBUserId: true, seedA: true, seedB: true }
  })
  for (const m of firstRound) {
    if (m.seedA) seedByUser.set(m.playerAUserId, m.seedA)
    if (m.seedB) seedByUser.set(m.playerBUserId, m.seedB)
  }

  const winners = matches.map(m => (m.status === 'BYE' ? m.playerAUserId : m.winnerUserId)).filter(Boolean)
  if (winners.length < 2) return false
  const round = await createRound(tx, t, 'BRACKET', last.roundNumber + 1, now)
  const rows = []
  for (let i = 0; i + 1 < winners.length; i += 2) {
    rows.push({
      tournamentId: t.id, roundId: round.id, stage: 'BRACKET', roundNumber: round.roundNumber,
      tableNumber: i / 2 + 1, playerAUserId: winners[i], playerBUserId: winners[i + 1],
      status: 'PENDING', bestOf: BEST_OF, requiresWinner: true, pairedAt: now, dueAt: round.dueAt,
      seedA: seedByUser.get(winners[i]) || null, seedB: seedByUser.get(winners[i + 1]) || null
    })
  }
  if (rows.length) await tx.ogGtoonTournamentMatch.createMany({ data: rows })
  events.push({ type: 'ROUND_OPEN', tournamentId: t.id, roundId: round.id })
  return true
}

async function finishTournament(tx, t, now, events) {
  await recomputeRecords(tx, t.id)
  const records = await tx.ogGtoonTournamentPlayerRecord.findMany({ where: { tournamentId: t.id } })
  const bracketMatches = await tx.ogGtoonTournamentMatch.findMany({ where: { tournamentId: t.id, stage: 'BRACKET' } })
  const placements = buildFinalPlacements({ format: t.format, records, bracketMatches })
  const winnerId = placements[0]?.userId || null

  const users = await tx.user.findMany({ where: { id: { in: placements.map(p => p.userId) } }, select: { id: true, username: true } })
  const nameById = new Map(users.map(u => [u.id, u.username]))
  const recById = new Map(records.map(r => [r.userId, r]))
  const stored = placements.map(p => {
    const r = recById.get(p.userId) || {}
    return {
      userId: p.userId, username: nameById.get(p.userId) || 'Unknown', place: p.place,
      swissWins: r.swissWins || 0, swissLosses: r.swissLosses || 0, swissTies: r.swissTies || 0,
      bracketWins: r.bracketWins || 0, bracketLosses: r.bracketLosses || 0, points: r.points || 0
    }
  })

  await tx.ogGtoonTournament.update({
    where: { id: t.id },
    data: {
      status: 'COMPLETE', winnerUserId: winnerId, finalizedAt: now, tournamentCompletedAt: now,
      finalPlacementsJson: stored
    }
  })
  await queuePrizeGrants(tx, { ...t, winnerUserId: winnerId }, placements)
  events.push({ type: 'COMPLETE', tournamentId: t.id })
}

/**
 * Builds the next round / finishes the tournament for as long as the current round is complete.
 * Serialised per tournament by a row lock. Returns the events (round opened, completed) the
 * caller sends AFTER the transaction — never DMs inside it.
 */
export async function advanceTournament(db, tournamentId, { now = new Date() } = {}) {
  const events = []
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT id FROM "OgGtoonTournament" WHERE id = ${tournamentId} FOR UPDATE`
    if (!rows.length) return
    for (let i = 0; i < 20; i += 1) {
      const t = await tx.ogGtoonTournament.findUnique({ where: { id: tournamentId } })
      if (!t) break
      let progressed = false
      if (t.status === 'SWISS_ACTIVE') progressed = await stepSwiss(tx, t, now, events)
      else if (t.status === 'BRACKET_ACTIVE') progressed = await stepBracket(tx, t, now, events)
      else break
      if (!progressed) break
    }
    await tx.ogGtoonTournament.updateMany({ where: { id: tournamentId }, data: { lastAdvancedAt: now } })
  }, { timeout: 60000, maxWait: 10000 })
  return events
}

export async function sendEvents(db, events) {
  for (const e of events) {
    try {
      if (e.type === 'ROUND_OPEN') await sendRoundOpenDMs(db, e.tournamentId, e.roundId)
      if (e.type === 'COMPLETE') await announceComplete(db, e.tournamentId)
    } catch (err) {
      console.error('[ogTournament] event failed:', e.type, err?.message || err)
    }
  }
}

async function announceComplete(db, tournamentId) {
  const t = await db.ogGtoonTournament.findUnique({ where: { id: tournamentId }, include: { winner: { select: { username: true } } } })
  if (!t) return
  const channelId = (t.announcementChannelId || '').trim() || process.env.DISCORD_ANNOUNCEMENT_CHANNEL
  const botToken = process.env.DISCORD_ANNOUNCEMENTS_BOT_TOKEN || process.env.BOT_TOKEN
  if (!channelId || !botToken) return
  const top = Array.isArray(t.finalPlacementsJson) ? t.finalPlacementsJson.slice(0, 3) : []
  const lines = [`🏆 ${t.name} is complete!`, `• Winner: ${t.winner?.username || 'TBD'}`]
  if (top.length > 1) lines.push(`• Podium: ${top.map(p => `${p.place}. ${p.username}`).join(' · ')}`)
  lines.push(`• Results: ${getOgTournamentUrl(t.id)}`)
  await sendGuildChannelMessageById(channelId, lines.join('\n'), botToken)
}

/** Worker entry point: score the pairing that just finished (if given), advance, then notify. */
export async function advanceAndNotify(db, tournamentId, { matchId = null } = {}) {
  if (matchId) await settleMatchFromGames(matchId)
  await recomputeRecords(db, tournamentId)
  const events = await advanceTournament(db, tournamentId)
  await sendEvents(db, events)
  return events
}

/* ── Results that don't come from played games ──────────────────────────────────────────── */

/**
 * Decides a pairing without (or beyond) played games. A guarded updateMany, so it only ever lands on
 * a pairing nobody else has decided. `outcome` null = both players lose (Swiss double no-show).
 */
export async function lockMatchResult(db, match, { outcome, resolution, winsA, winsB, note = null, now = new Date() }) {
  const winnerUserId = outcome === 'A_WIN' ? match.playerAUserId : outcome === 'B_WIN' ? match.playerBUserId : null
  const claimed = await db.ogGtoonTournamentMatch.updateMany({
    where: { id: match.id, lockedAt: null },
    data: {
      status: 'COMPLETE', outcome, winnerUserId, resolution,
      winsA: winsA ?? match.winsA, winsB: winsB ?? match.winsB,
      needsAdmin: false, needsAdminReason: null, liveMatchId: null, liveStartedAt: null,
      readyAAt: null, readyBAt: null,
      ...(note ? { adminNotes: note } : {}),
      lockedAt: now, completedAt: now
    }
  })
  return claimed.count === 1
}

/** A player gives up their series. Refused while a game is live (leave that game instead). */
export async function forfeitMatch(db, { tournamentId, matchId, userId, now = new Date() }) {
  const match = await db.ogGtoonTournamentMatch.findUnique({ where: { id: matchId }, include: { tournament: { select: { status: true } } } })
  if (!match || match.tournamentId !== tournamentId) return { ok: false, code: 404, message: 'Match not found' }
  if (!ACTIVE_STATUSES.includes(match.tournament.status)) return { ok: false, code: 400, message: 'This tournament is not running' }
  if (match.lockedAt || !['PENDING', 'IN_PROGRESS'].includes(match.status)) return { ok: false, code: 400, message: 'This match has already been decided' }
  const isA = match.playerAUserId === userId
  const isB = match.playerBUserId === userId
  if (!isA && !isB) return { ok: false, code: 403, message: 'You are not a player in this match' }
  if (match.liveMatchId) return { ok: false, code: 400, message: 'A game is being played right now. Finish or leave it first.' }
  const done = await lockMatchResult(db, match, {
    outcome: isA ? 'B_WIN' : 'A_WIN', resolution: 'FORFEIT',
    winsA: isA ? match.winsA : WINS_NEEDED, winsB: isB ? match.winsB : WINS_NEEDED,
    note: 'Forfeited by a player', now
  })
  return done ? { ok: true } : { ok: false, code: 409, message: 'This match was just decided' }
}

/* ── Deadlines, reminders, disqualifications ─────────────────────────────────────────────── */

export async function processDeadlines(db, now = new Date()) {
  const touched = new Set()
  const decided = []
  await clearStaleLive(db, now)

  const due = await db.ogGtoonTournamentMatch.findMany({
    where: {
      lockedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] }, needsAdmin: false, liveMatchId: null,
      dueAt: { lte: now }, tournament: { status: { in: ACTIVE_STATUSES } }
    },
    take: 500
  })
  for (const m of due) {
    const settled = await settleMatchFromGames(m.id, { now })
    if (settled.locked || settled.decided) { touched.add(m.tournamentId); continue }
    const fresh = await db.ogGtoonTournamentMatch.findUnique({ where: { id: m.id } })
    if (!fresh || fresh.lockedAt) continue
    const { scoreA, scoreB } = await loadSeriesGames(fresh, db)
    const d = decideAtDeadline(fresh, { now: now.getTime(), scoreA, scoreB })
    if (d.kind === 'NEEDS_ADMIN') {
      await db.ogGtoonTournamentMatch.updateMany({ where: { id: m.id, lockedAt: null }, data: { needsAdmin: true, needsAdminReason: d.reason } })
      continue
    }
    const ok = await lockMatchResult(db, fresh, { outcome: d.outcome, resolution: d.resolution, winsA: d.winsA, winsB: d.winsB, now })
    if (ok) {
      touched.add(m.tournamentId)
      decided.push({ matchId: m.id, reason: d.resolution === 'WALKOVER' ? 'walkover — the other player did not show up' : 'deadline passed' })
    }
  }

  for (const d of decided) {
    try {
      const match = await db.ogGtoonTournamentMatch.findUnique({ where: { id: d.matchId }, include: { tournament: { select: { id: true, name: true } } } })
      if (match) await sendMatchDecidedDMs(db, match, match.tournament, d.reason)
    } catch (err) { console.error('[ogTournament] decided DM failed:', err?.message || err) }
  }
  return [...touched]
}

export async function processReminders(db, now = new Date()) {
  for (const [hours, field, label] of [[24, 'reminder24SentAt', '24 hours'], [4, 'reminder4SentAt', '4 hours']]) {
    const soon = await db.ogGtoonTournamentMatch.findMany({
      where: {
        lockedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] }, needsAdmin: false, [field]: null,
        dueAt: { gt: now, lte: new Date(now.getTime() + hours * HOUR) },
        tournament: { status: { in: ACTIVE_STATUSES } }
      },
      include: {
        tournament: { select: { id: true, name: true } },
        playerA: { select: { id: true, username: true } },
        playerB: { select: { id: true, username: true } }
      },
      take: 500
    })
    for (const m of soon) {
      const claimed = await db.ogGtoonTournamentMatch.updateMany({ where: { id: m.id, [field]: null }, data: { [field]: now } })
      if (!claimed.count) continue
      const items = [[m.playerA, m.playerB], [m.playerB, m.playerA]].map(([me, opp]) => ({
        userId: me.id,
        text: `⏰ ${m.tournament.name}: your match vs ${opp.username} is due in about ${label} (${formatCentral(m.dueAt)}). ` +
          `Both of you need to be online to play. ${getOgTournamentUrl(m.tournament.id)}`
      }))
      await dmUsers(db, items).catch(() => {})
    }
  }
}

/** Takes a player out of a running tournament; their open pairings go to the opponent. */
export async function disqualifyPlayer(db, { tournamentId, userId, note, now = new Date() }) {
  await db.ogGtoonTournamentOptIn.updateMany({
    where: { tournamentId, userId }, data: { disqualified: true, disqualifiedNote: note || 'Disqualified' }
  })
  const open = await db.ogGtoonTournamentMatch.findMany({
    where: {
      tournamentId, lockedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] },
      OR: [{ playerAUserId: userId }, { playerBUserId: userId }]
    }
  })
  for (const m of open) {
    const isA = m.playerAUserId === userId
    const oppId = isA ? m.playerBUserId : m.playerAUserId
    const oppOpt = await db.ogGtoonTournamentOptIn.findFirst({ where: { tournamentId, userId: oppId } })
    if (oppOpt?.disqualified) {
      if (m.stage === 'BRACKET') {
        await db.ogGtoonTournamentMatch.updateMany({ where: { id: m.id, lockedAt: null }, data: { needsAdmin: true, needsAdminReason: 'Both players were disqualified' } })
      } else {
        await lockMatchResult(db, m, { outcome: null, resolution: 'ADMIN', winsA: 0, winsB: 0, note: 'Both players disqualified', now })
      }
      continue
    }
    await lockMatchResult(db, m, {
      outcome: isA ? 'B_WIN' : 'A_WIN', resolution: 'ADMIN',
      winsA: isA ? 0 : WINS_NEEDED, winsB: isA ? WINS_NEEDED : 0,
      note: note || 'Opponent disqualified', now
    })
  }
  return open.length
}

/** A banned account in a running tournament is disqualified automatically. */
export async function processBannedEntrants(db, now = new Date()) {
  const rows = await db.ogGtoonTournamentOptIn.findMany({
    where: {
      isActive: true, disqualified: false,
      tournament: { status: { in: ['OPT_IN_OPEN', 'OPT_IN_CLOSED', ...ACTIVE_STATUSES] } },
      user: { OR: [{ banned: true }, { active: false }] }
    },
    select: { tournamentId: true, userId: true, tournament: { select: { status: true } } },
    take: 200
  })
  const touched = new Set()
  for (const r of rows) {
    if (ACTIVE_STATUSES.includes(r.tournament.status)) {
      await disqualifyPlayer(db, { tournamentId: r.tournamentId, userId: r.userId, note: 'Account no longer in good standing', now })
      touched.add(r.tournamentId)
    } else {
      await db.ogGtoonTournamentOptIn.updateMany({
        where: { tournamentId: r.tournamentId, userId: r.userId },
        data: { isActive: false, disqualifiedNote: 'Account no longer in good standing' }
      })
    }
  }
  return [...touched]
}

/* ── Admin actions ───────────────────────────────────────────────────────────────────────── */

const clampWins = (n, max = WINS_NEEDED) => Math.max(0, Math.min(max, Math.floor(Number(n) || 0)))

/**
 * An admin names the result of an unfinished pairing. outcome: 'A_WIN' | 'B_WIN' | 'TIE' (Swiss
 * only). A live game is allowed to be running: the pairing locks, the socket server closes that
 * game within a minute and it no longer counts.
 */
export async function adminSetMatchResult(db, { tournamentId, matchId, outcome, winsA, winsB, note, now = new Date() }) {
  const match = await db.ogGtoonTournamentMatch.findUnique({ where: { id: matchId }, include: { tournament: { select: { status: true } } } })
  if (!match || match.tournamentId !== tournamentId) return { ok: false, code: 404, message: 'Match not found' }
  if (match.status === 'BYE') return { ok: false, code: 400, message: 'A bye cannot be changed' }
  if (!ACTIVE_STATUSES.includes(match.tournament.status)) return { ok: false, code: 400, message: 'This tournament is not running' }
  if (match.lockedAt) return { ok: false, code: 400, message: 'This match is already decided. Reopen it first.' }
  if (!['A_WIN', 'B_WIN', 'TIE'].includes(outcome)) return { ok: false, code: 400, message: 'Pick a winner or a draw' }
  if (outcome === 'TIE' && match.stage !== 'SWISS') return { ok: false, code: 400, message: 'A bracket match cannot end in a draw' }
  if (!String(note || '').trim()) return { ok: false, code: 400, message: 'A reason is required' }

  let a = winsA == null ? null : clampWins(winsA)
  let b = winsB == null ? null : clampWins(winsB)
  if (outcome === 'A_WIN') { a = a ?? WINS_NEEDED; b = b ?? 0; if (!(a > b)) return { ok: false, code: 400, message: 'The winner must have more game wins' } }
  if (outcome === 'B_WIN') { b = b ?? WINS_NEEDED; a = a ?? 0; if (!(b > a)) return { ok: false, code: 400, message: 'The winner must have more game wins' } }
  if (outcome === 'TIE') { a = a ?? 1; b = b ?? 1; if (a !== b) return { ok: false, code: 400, message: 'A draw needs equal game wins' } }

  const ok = await lockMatchResult(db, match, { outcome, resolution: 'ADMIN', winsA: a, winsB: b, note: String(note).trim(), now })
  if (!ok) return { ok: false, code: 409, message: 'This match was just decided' }
  return { ok: true, hadLiveGame: !!match.liveMatchId }
}

/** Puts a decided pairing back in play, but only while nothing later has been built from it. */
export async function adminReopenMatch(db, { tournamentId, matchId }) {
  const match = await db.ogGtoonTournamentMatch.findUnique({ where: { id: matchId }, include: { tournament: true } })
  if (!match || match.tournamentId !== tournamentId) return { ok: false, code: 404, message: 'Match not found' }
  if (match.status === 'BYE') return { ok: false, code: 400, message: 'A bye cannot be reopened' }
  if (!match.lockedAt) return { ok: false, code: 400, message: 'This match is not decided' }
  const t = match.tournament
  if (!ACTIVE_STATUSES.includes(t.status)) return { ok: false, code: 400, message: 'This tournament is not running' }
  const later = await db.ogGtoonTournamentRound.findFirst({
    where: {
      tournamentId,
      OR: [
        { stage: match.stage, roundNumber: { gt: match.roundNumber } },
        ...(match.stage === 'SWISS' ? [{ stage: 'BRACKET' }] : [])
      ]
    }
  })
  if (later) return { ok: false, code: 400, message: 'The next round has already been created, so this result can no longer be reopened.' }

  await db.ogGtoonTournamentMatch.update({
    where: { id: matchId },
    data: {
      lockedAt: null, completedAt: null, outcome: null, winnerUserId: null, resolution: null,
      status: match.gamesCounted > 0 ? 'IN_PROGRESS' : 'PENDING', needsAdmin: false, needsAdminReason: null,
      adminNotes: null, dueAt: new Date(Date.now() + (t.roundWindowHours || 72) * HOUR)
    }
  })
  await settleMatchFromGames(matchId)
  await recomputeRecords(db, tournamentId)
  return { ok: true }
}

/** Removes one finished game from a series (it is replayed). The pairing must not be decided. */
export async function adminVoidGame(db, { tournamentId, matchId, gameId }) {
  const match = await db.ogGtoonTournamentMatch.findUnique({ where: { id: matchId } })
  if (!match || match.tournamentId !== tournamentId) return { ok: false, code: 404, message: 'Match not found' }
  if (match.lockedAt) return { ok: false, code: 400, message: 'Reopen the match before voiding a game' }
  const game = await db.ogGtoonMatch.findUnique({ where: { id: gameId }, select: { id: true, tournamentMatchId: true } })
  if (!game || game.tournamentMatchId !== matchId) return { ok: false, code: 404, message: 'Game not found in this match' }
  await db.ogGtoonMatch.update({ where: { id: gameId }, data: { outcome: 'INCOMPLETE' } })
  await settleMatchFromGames(matchId)
  return { ok: true }
}

/** Moves one pairing's deadline later (logged by the caller). */
export async function adminExtendDeadline(db, { tournamentId, matchId, hours }) {
  const h = Math.max(1, Math.min(24 * 14, Math.floor(Number(hours) || 0)))
  const match = await db.ogGtoonTournamentMatch.findUnique({ where: { id: matchId } })
  if (!match || match.tournamentId !== tournamentId) return { ok: false, code: 404, message: 'Match not found' }
  if (match.lockedAt) return { ok: false, code: 400, message: 'This match is already decided' }
  const from = Math.max(Date.now(), match.dueAt ? match.dueAt.getTime() : 0)
  await db.ogGtoonTournamentMatch.update({
    where: { id: matchId },
    data: { dueAt: new Date(from + h * HOUR), needsAdmin: false, needsAdminReason: null, reminder24SentAt: null, reminder4SentAt: null }
  })
  return { ok: true, hours: h }
}

export async function cancelTournament(db, tournamentId) {
  await db.ogGtoonTournament.update({ where: { id: tournamentId }, data: { status: 'CANCELLED', nextAnnouncementAt: null } })
}

/* ── Prizes ──────────────────────────────────────────────────────────────────────────────── */

export function bundleIsEmpty(b) {
  return !b || (!(Number(b.points) > 0) && !(b.ctoons?.length) && !(b.backgrounds?.length))
}

/** Creates one ledger row per recipient (idempotent: unique on tournament+user). */
export async function queuePrizeGrants(db, tournament, placements) {
  const full = await db.ogGtoonTournament.findUnique({ where: { id: tournament.id } })
  const optIns = await db.ogGtoonTournamentOptIn.findMany({
    where: { tournamentId: tournament.id, isActive: true, disqualified: false },
    select: { userId: true, user: { select: { banned: true, active: true } } }
  })
  const playedRows = await db.ogGtoonTournamentMatch.findMany({
    where: { tournamentId: tournament.id, gamesCounted: { gt: 0 } },
    select: { playerAUserId: true, playerBUserId: true }
  })
  const played = new Set(playedRows.flatMap(m => [m.playerAUserId, m.playerBUserId]))
  const eligible = new Set(optIns.filter(o => !o.user?.banned && o.user?.active !== false && played.has(o.userId)).map(o => o.userId))

  const entrants = optIns.length
  const recipients = prizeRecipients({
    placements, entrants, minEntrantsTop8: full.minEntrantsTop8Prize, eligible,
    hasFirst: !bundleIsEmpty(full.firstPrizeJson), hasTop8: !bundleIsEmpty(full.top8PrizeJson)
  })
  if (recipients.length) {
    await db.ogGtoonTournamentPrizeGrant.createMany({
      data: recipients.map(r => ({
        tournamentId: tournament.id, userId: r.userId, tier: r.tier, place: r.place,
        status: full.requirePrizeApproval ? 'PENDING_APPROVAL' : 'PENDING',
        rewardJson: r.tier === 'FIRST' ? full.firstPrizeJson : full.top8PrizeJson
      })),
      skipDuplicates: true
    })
  }
  await db.ogGtoonTournament.update({ where: { id: tournament.id }, data: { prizesQueuedAt: new Date() } })
}

/** Releases held prizes (and retries failed ones). */
export async function approvePrizeGrants(db, { tournamentId, adminId, now = new Date() }) {
  const r = await db.ogGtoonTournamentPrizeGrant.updateMany({
    where: { tournamentId, status: { in: ['PENDING_APPROVAL', 'FAILED'] } },
    data: { status: 'PENDING', errorMessage: null, attempts: 0 }
  })
  await db.ogGtoonTournament.update({ where: { id: tournamentId }, data: { prizesApprovedAt: now, prizesApprovedById: adminId } })
  return r.count
}

async function rewardForGrant(db, bundle) {
  const ctoonIds = (bundle?.ctoons || []).map(c => c.ctoonId)
  const ctoons = ctoonIds.length
    ? await db.ctoon.findMany({ where: { id: { in: ctoonIds } }, select: { id: true, name: true, quantity: true } })
    : []
  const byId = new Map(ctoons.map(c => [c.id, c]))
  return {
    points: Number(bundle?.points) || 0,
    backgrounds: (bundle?.backgrounds || []).map(b => ({ backgroundId: b.backgroundId })),
    ctoons: (bundle?.ctoons || []).map(c => ({ ctoonId: c.ctoonId, quantity: c.quantity, ctoon: byId.get(c.ctoonId) || null }))
  }
}

async function payOneGrant(db, grant, tournament) {
  const method = `ogGtoonTournament:${tournament.id}:${grant.tier}`
  const reward = await rewardForGrant(db, grant.rewardJson)
  if (bundleIsEmpty({ points: reward.points, ctoons: reward.ctoons, backgrounds: reward.backgrounds })) {
    await db.ogGtoonTournamentPrizeGrant.updateMany({ where: { id: grant.id }, data: { status: 'SKIPPED' } })
    return
  }
  let summary = null
  try {
    summary = await db.$transaction(async (tx) => {
      const claimed = await tx.ogGtoonTournamentPrizeGrant.updateMany({
        where: { id: grant.id, status: { in: ['PENDING', 'FAILED'] } },
        data: { status: 'PAID', attempts: { increment: 1 }, grantedAt: new Date(), errorMessage: null }
      })
      if (!claimed.count) return null
      const s = await grantRewardInTx(tx, grant.userId, reward, method)
      const requested = reward.ctoons.map(c => ({ name: c.ctoon?.name || c.ctoonId, requested: c.quantity }))
      const granted = new Map(s.ctoonJobs.map(j => [j.name, j.quantity]))
      const shortfall = requested
        .map(r => ({ ...r, granted: granted.get(r.name) || 0 }))
        .filter(r => r.granted < r.requested)
      await tx.ogGtoonTournamentPrizeGrant.update({
        where: { id: grant.id },
        data: {
          summaryJson: {
            points: s.points, backgrounds: s.backgrounds, ctoonJobs: s.ctoonJobs,
            mintsPending: s.ctoonJobs.length > 0, shortfall
          },
          ...(shortfall.length ? { errorMessage: 'cToon supply ran short — an admin may need to top this up' } : {})
        }
      })
      return s
    }, { timeout: 30000, maxWait: 10000 })
  } catch (err) {
    await db.ogGtoonTournamentPrizeGrant.updateMany({
      where: { id: grant.id, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'FAILED', attempts: { increment: 1 }, errorMessage: String(err?.message || err).slice(0, 500) }
    })
    return
  }
  if (summary?.ctoonJobs?.length) await finishMints(db, grant.id, grant.userId, summary.ctoonJobs, method)
}

async function finishMints(db, grantId, userId, ctoonJobs, method) {
  try {
    await enqueueCtoonJobs(userId, ctoonJobs, method)
  } catch (err) {
    console.error('[ogTournament] mint enqueue failed (will retry):', err?.message || err)
    return
  }
  const row = await db.ogGtoonTournamentPrizeGrant.findUnique({ where: { id: grantId }, select: { summaryJson: true } })
  await db.ogGtoonTournamentPrizeGrant.update({
    where: { id: grantId },
    data: { summaryJson: { ...(row?.summaryJson || {}), mintsPending: false } }
  })
}

/** Pays queued prizes one recipient at a time and re-enqueues any cToon mints that did not queue. */
export async function processPrizeGrants(db) {
  const stuck = await db.ogGtoonTournamentPrizeGrant.findMany({
    where: { status: 'PAID', summaryJson: { path: ['mintsPending'], equals: true } },
    include: { tournament: { select: { id: true } } }, take: 50
  })
  for (const g of stuck) {
    const jobs = g.summaryJson?.ctoonJobs || []
    if (jobs.length) await finishMints(db, g.id, g.userId, jobs, `ogGtoonTournament:${g.tournamentId}:${g.tier}`)
  }

  const pending = await db.ogGtoonTournamentPrizeGrant.findMany({
    where: { OR: [{ status: 'PENDING' }, { status: 'FAILED', attempts: { lt: 5 } }] },
    include: { tournament: { select: { id: true } } },
    orderBy: { createdAt: 'asc' }, take: 50
  })
  for (const g of pending) {
    try { await payOneGrant(db, g, g.tournament) } catch (err) { console.error('[ogTournament] prize failed:', err?.message || err) }
  }
}

/** Warnings (not errors) about whether a prize can actually be paid, for the admin form. */
export async function prizeSupplyWarnings(db, bundle, recipientCount) {
  const warnings = []
  for (const c of bundle?.ctoons || []) {
    const ctoon = await db.ctoon.findUnique({ where: { id: c.ctoonId }, select: { name: true, quantity: true } })
    if (!ctoon || ctoon.quantity == null) continue
    const minted = await db.userCtoon.count({ where: { ctoonId: c.ctoonId } })
    const remaining = Math.max(0, ctoon.quantity - minted)
    const needed = c.quantity * recipientCount
    if (remaining < needed) warnings.push(`${ctoon.name}: only ${remaining} left to mint, ${needed} needed if every recipient is paid.`)
  }
  return warnings
}

/* ── Deck repair ─────────────────────────────────────────────────────────────────────────── */

/**
 * Lets a player replace the cards of their LOCKED deck that are no longer valid (sold, traded,
 * burned, or handed to someone and back). Only the flagged slots can change, each with a
 * different card the player owns now, and only between series — never mid-series or mid-game.
 * Handing a flagged card back never clears the flag, so lending cards between games cannot be
 * "repaired" away; the card is simply replaced.
 */
export async function repairLockedDeck(db, { tournamentId, userId, replacements, now = new Date() }) {
  const t = await db.ogGtoonTournament.findUnique({ where: { id: tournamentId }, select: { status: true } })
  if (!t || !['OPT_IN_CLOSED', ...ACTIVE_STATUSES].includes(t.status)) {
    return { ok: false, code: 400, message: 'A deck can only be repaired once opt-in has closed and while the tournament is running. Before that, just lock in a different deck.' }
  }
  const optIn = await db.ogGtoonTournamentOptIn.findUnique({ where: { tournamentId_userId: { tournamentId, userId } } })
  if (!optIn || !optIn.isActive || optIn.disqualified) return { ok: false, code: 403, message: 'You are not an active entrant' }

  const open = await db.ogGtoonTournamentMatch.findFirst({
    where: { tournamentId, lockedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] }, OR: [{ playerAUserId: userId }, { playerBUserId: userId }] }
  })
  if (open?.liveMatchId) return { ok: false, code: 400, message: 'You are in a game right now' }
  if (open && open.gamesCounted > 0) return { ok: false, code: 400, message: 'Your deck cannot change in the middle of a series. Finish this series first.' }

  const check = await loadLockedDeckForGame(userId, optIn.deckSnapshotJson, db)
  const flagged = [...check.missing, ...check.moved]
  if (!flagged.length) return { ok: false, code: 400, message: 'Your locked deck has no problems to repair' }

  const list = Array.isArray(replacements) ? replacements : []
  const byPos = new Map(list.map(r => [Number(r?.position), String(r?.ctoonId || '')]))
  if (byPos.size !== flagged.length || !flagged.every(pos => byPos.get(pos))) {
    return { ok: false, code: 400, message: 'Replace every flagged card, and only those', flagged }
  }

  const snapshot = optIn.deckSnapshotJson.map(s => ({ ...s }))
  const keep = new Set(snapshot.filter(s => !flagged.includes(s.position)).map(s => s.ctoonId))
  // Every copy in the old snapshot is off the table, flagged ones included: re-picking the very copy
  // that was lent out would clear the flag, so a flagged slot needs a DIFFERENT copy.
  const usedCopies = new Set(snapshot.map(s => s.userCtoonId))
  const newIds = [...byPos.values()]
  if (new Set(newIds).size !== newIds.length || newIds.some(id => keep.has(id))) {
    return { ok: false, code: 400, message: 'A tournament deck needs 12 different cards' }
  }
  const ctoons = await db.ctoon.findMany({ where: { id: { in: newIds } }, select: { id: true, name: true, isOgGtoon: true } })
  if (ctoons.length !== newIds.length || ctoons.some(c => !c.isOgGtoon)) return { ok: false, code: 400, message: 'Pick gToon cards' }
  const copies = await db.userCtoon.findMany({
    where: { userId, ctoonId: { in: newIds }, burnedAt: null }, select: { id: true, ctoonId: true }, orderBy: { createdAt: 'asc' }
  })
  const copyFor = new Map()
  for (const c of copies) if (!copyFor.has(c.ctoonId) && !usedCopies.has(c.id)) copyFor.set(c.ctoonId, c.id)
  for (const [pos, ctoonId] of byPos) {
    const copyId = copyFor.get(ctoonId)
    if (!copyId) return { ok: false, code: 400, message: `You do not own ${ctoons.find(c => c.id === ctoonId)?.name || 'that card'}` }
    const slot = snapshot.find(s => s.position === pos)
    Object.assign(slot, { ctoonId, userCtoonId: copyId, lockedAt: now.toISOString() })
  }
  await db.ogGtoonTournamentOptIn.update({
    where: { id: optIn.id },
    data: { deckSnapshotJson: snapshot, repairCount: { increment: 1 }, lastRepairedAt: now }
  })
  return { ok: true, replaced: flagged.length }
}

/* ── Ready-up DM (queued by the socket server) ───────────────────────────────────────────── */

export async function notifyOpponentReady(db, { tournamentMatchId, readyUserId }) {
  const flag = `ogt-ready-dm:${tournamentMatchId}:${readyUserId}`
  if (await hasFlag(flag)) return
  const m = await db.ogGtoonTournamentMatch.findUnique({
    where: { id: tournamentMatchId },
    include: {
      tournament: { select: { id: true, name: true } },
      playerA: { select: { id: true, username: true } },
      playerB: { select: { id: true, username: true } }
    }
  })
  if (!m || m.lockedAt) return
  const me = m.playerAUserId === readyUserId ? m.playerA : m.playerB
  const opp = m.playerAUserId === readyUserId ? m.playerB : m.playerA
  const mine = m.playerAUserId === readyUserId ? m.readyAAt : m.readyBAt
  if (!isFresh(mine)) return
  await setFlag(flag, 30 * 60)
  await dmUsers(db, [{
    userId: opp.id,
    text: `🎮 ${me.username} is ready to play your ${m.tournament.name} match and is waiting for you. ` +
      `Open the tournament and press Play: ${getOgTournamentUrl(m.tournament.id)}`
  }])
}

/* ── The cron entry point ────────────────────────────────────────────────────────────────── */

export async function runOgGtoonTournamentScheduler(db, now = new Date()) {
  const events = await processStateTransitions(db, now)
  await sendEvents(db, events)
  await processAnnouncements(db, now)

  const touched = new Set()
  for (const id of await processBannedEntrants(db, now)) touched.add(id)

  // Games that finished but were never scored (a lost queue job, a restart in between).
  const unscored = await db.ogGtoonMatch.findMany({
    where: {
      tournamentMatchId: { not: null }, endedAt: { not: null },
      tournamentMatch: { lockedAt: null, tournament: { status: { in: ACTIVE_STATUSES } } }
    },
    distinct: ['tournamentMatchId'],
    select: { tournamentMatchId: true, tournamentMatch: { select: { tournamentId: true } } },
    take: 500
  })
  for (const g of unscored) {
    await settleMatchFromGames(g.tournamentMatchId, { now })
    touched.add(g.tournamentMatch.tournamentId)
  }

  for (const id of await processDeadlines(db, now)) touched.add(id)

  const active = await db.ogGtoonTournament.findMany({ where: { status: { in: ACTIVE_STATUSES } }, select: { id: true } })
  for (const t of active) touched.add(t.id)
  for (const id of touched) {
    try {
      await recomputeRecords(db, id)
      await sendEvents(db, await advanceTournament(db, id, { now }))
    } catch (err) {
      console.error(`[ogTournament] advance ${id} failed:`, err?.message || err)
    }
  }

  await processReminders(db, now)
  await processPrizeGrants(db)
  return { advanced: touched.size }
}
