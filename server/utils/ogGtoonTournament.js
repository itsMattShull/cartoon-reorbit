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
import { armOgTournamentDeadline } from './queues.js'
import { decideAndLock, closeTournamentGames, ensureNextGameInTx, lockPairing, restoreMatch, needsToAct } from './ogGtoonTournamentGames.js'
import { goalCardFor } from './ogGtoonEngine.js'
import {
  gameStartedText, yourTurnText, deckProblemText, matchDecidedAwayText, roundOpenAsyncText, reminderAsyncText, gameUrl
} from './ogGtoonTournamentMessages.js'
import { grantCodePacks } from './codePackGrant.js'
import { hasFlag, setFlag, claimFlag, clearFlag } from './cache.js'
import {
  BEST_OF, WINS_NEEDED, formatFor, swissRoundsFor, compareStandings, seededShuffle, bracketSizeFor,
  buildBracketSeedPairs, bracketRoundLabel, pairSwissRound, pairKey, decideAtDeadline,
  computeRecords, buildFinalPlacements, prizeRecipients, roundDueAt, reminderApplies
} from './tournamentCore.js'
import {
  ACTIVE_STATUSES, settleMatchFromGames, loadSeriesGames, clearStaleLive, isFresh, loadLockedDeckForGame, lockMatchResult
} from './ogGtoonTournamentLive.js'

const CENTRAL_TZ = 'America/Chicago'
const ANNOUNCE_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000
const HOUR = 3600 * 1000

function baseUrl() {
  return process.env.PUBLIC_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://www.cartoonreorbit.com' : 'http://localhost:3000')
}
/**
 * The tournament's own page (opt in/out, your next opponent, standings, and the Start next game button). Every Discord
 * message about a tournament links here — keep it in step with pages/newsite/gtoons-classic/tournaments/[tid].vue.
 * (Links sent before this page existed, `/newsite/gtoons-classic?tab=tournaments&t=<id>`, still work: the Tournaments
 * tab forwards them.)
 */
export function getOgTournamentUrl(tournamentId) {
  return `${baseUrl()}/newsite/gtoons-classic/tournaments/${tournamentId}`
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

async function dmUsers(db, items, { onFail = null } = {}) {
  if (!items.length) return
  const ids = [...new Set(items.map(i => i.userId))]
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, discordId: true } })
  const discordById = new Map(users.map(u => [u.id, u.discordId]))
  await runLimited(items, 3, async (item) => {
    const discordId = discordById.get(item.userId)
    const sent = discordId ? await sendDiscordDMByDiscordId(discordId, item.text) : false
    // A failed send must not use up a once-only claim, or the player would never be told.
    if (!sent && onFail) await onFail(item)
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
      claimKey: `ogt-open-dm:${m.id}:${me.id}`,
      text: m.asyncRules
        ? roundOpenAsyncText({ tournamentName: tournament.name, label, oppUsername: opp.username || 'your opponent', dueText: round.dueAt ? formatCentral(round.dueAt) : 'the deadline', link })
        : [
        `🏆 ${tournament.name} — ${label}`,
        `You are paired with ${opp.username || 'your opponent'}.`,
        `• Best of 3 (first to 2 wins). Both of you need to be online to play.${due}`,
        `• Open your match and press Start next game: ${link}`
      ].join('\n')
    })
    items.push(mk(m.playerA, m.playerB), mk(m.playerB, m.playerA))
  }
  // Once per player per pairing, however many times this runs (a retried job, an admin recompute racing the cron).
  const fresh = []
  for (const item of items) {
    if (await claimFlag(item.claimKey, 14 * 24 * 3600)) fresh.push(item)
  }
  await dmUsers(db, fresh, { onFail: (item) => clearFlag(item.claimKey) })
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

/**
 * Every pairing made from now on is played under the async + live rules, and is stamped so: the flag plus the round's ORIGINAL
 * deadline (dueAt may later move by final-minute plays). Pairings made before this shipped carry asyncRules = false and finish
 * under the older both-online rules.
 */
const asyncFields = (_tournament, round) => ({ asyncRules: true, baseDueAt: round.dueAt })

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
    pairedAt: now, dueAt: round.dueAt, ...asyncFields(tournament, round)
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
        pairedAt: now, dueAt: round.dueAt, seedA, seedB, ...asyncFields(tournament, round)
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

/* ── State transitions (opt-in open / close / start) ─────────────────────────────────────── */

/**
 * Closes entry (if still open) and pairs everyone: builds the player records, disqualifies accounts no longer in good
 * standing, then makes round 1 (Swiss or bracket) — or cancels when fewer than 2 players are left. Runs under a row lock and
 * only acts on OPT_IN_OPEN / OPT_IN_CLOSED, so the cron, a late cron run and the admin Start button can't double-start.
 * Returns the events (round opened) for the caller to send after the transaction.
 */
export async function startTournament(db, tournamentId, now = new Date()) {
  const events = []
  await db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw`SELECT id FROM "OgGtoonTournament" WHERE id = ${tournamentId} FOR UPDATE`
    if (!locked.length) return
    const t = await tx.ogGtoonTournament.findUnique({ where: { id: tournamentId } })
    if (!t || !['OPT_IN_OPEN', 'OPT_IN_CLOSED'].includes(t.status)) return
    // Entry ends now if it was still open, so nobody can join or leave mid-pairing.
    await tx.ogGtoonTournament.update({
      where: { id: t.id },
      data: { status: 'OPT_IN_CLOSED', nextAnnouncementAt: null, ...(t.optInEndAt > now ? { optInEndAt: now } : {}) }
    })

    const optIns = await tx.ogGtoonTournamentOptIn.findMany({
      where: { tournamentId: t.id, isActive: true, disqualified: false },
      select: { id: true, userId: true, user: { select: { banned: true, active: true } } }
    })
    const bad = optIns.filter(o => o.user?.banned || o.user?.active === false)
    if (bad.length) {
      await tx.ogGtoonTournamentOptIn.updateMany({
        where: { id: { in: bad.map(o => o.id) } },
        data: { disqualified: true, disqualifiedNote: 'Account not in good standing when the tournament started' }
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
    let round
    if (format === 'BRACKET_8_OR_LESS') {
      await tx.ogGtoonTournament.update({ where: { id: t.id }, data: { status: 'BRACKET_ACTIVE', format, seedValue } })
      round = await createFirstBracket(tx, fresh, good.map(o => o.userId), now)
    } else {
      const planned = swissRoundsFor(good.length, t.swissRoundsOverride)
      await tx.ogGtoonTournament.update({ where: { id: t.id }, data: { status: 'SWISS_ACTIVE', format, seedValue, swissRoundsPlanned: planned } })
      round = await createSwissRound(tx, fresh, 1, now)
    }
    events.push({ type: 'ROUND_OPEN', tournamentId: t.id, roundId: round.id })
  }, { timeout: 60000, maxWait: 10000 })
  return events
}


export async function processStateTransitions(db, now = new Date()) {
  const events = []

  const toOpen = await db.ogGtoonTournament.findMany({ where: { status: 'DRAFT', optInStartAt: { lte: now } } })
  for (const t of toOpen) {
    await db.ogGtoonTournament.updateMany({
      where: { id: t.id, status: 'DRAFT' },
      data: { status: 'OPT_IN_OPEN', nextAnnouncementAt: t.optInStartAt, lastAnnouncementAt: null, finalOptInMidnightAnnouncementSent: false }
    })
  }

  // Opt-in has ended. Tournaments with a start time just close entry and wait for it (or the admin's Start
  // button); legacy ones with no start time start straight away, as they always did.
  const toClose = await db.ogGtoonTournament.findMany({ where: { status: 'OPT_IN_OPEN', optInEndAt: { lte: now } } })
  for (const t of toClose) {
    if (t.startAt) {
      await db.ogGtoonTournament.updateMany({ where: { id: t.id, status: 'OPT_IN_OPEN' }, data: { status: 'OPT_IN_CLOSED', nextAnnouncementAt: null } })
    } else {
      const ev = await startTournament(db, t.id, now)
      events.push(...ev)
    }
  }

  const toStart = await db.ogGtoonTournament.findMany({ where: { status: 'OPT_IN_CLOSED', startAt: { not: null, lte: now } }, select: { id: true } })
  for (const t of toStart) events.push(...(await startTournament(db, t.id, now)))
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
      seedA: seedByUser.get(winners[i]) || null, seedB: seedByUser.get(winners[i + 1]) || null,
      ...asyncFields(t, round)
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
      const row = await tx.ogGtoonTournament.findUnique({ where: { id: tournamentId } })
      if (!row) break
      const t = row
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

/** Arms the exact-time deadline decision for every async pairing of a freshly opened round (the cron is the safety net). */
export async function armRoundDeadlines(db, roundId, arm = armOgTournamentDeadline) {
  const rows = await db.ogGtoonTournamentMatch.findMany({
    where: { roundId, asyncRules: true, lockedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { not: null } },
    select: { id: true, dueAt: true }
  })
  for (const r of rows) await arm(r.id, r.dueAt).catch(err => console.error('[ogTournament] could not arm deadline:', err?.message || err))
}

export async function sendEvents(db, events) {
  for (const e of events) {
    try {
      if (e.type === 'ROUND_OPEN') await armRoundDeadlines(db, e.roundId)
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

// lockMatchResult lives in ogGtoonTournamentLive.js (the socket server needs it too) and also closes a running async game.
export { lockMatchResult }

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
  // Under the async rules the games that were really played keep their real score (it feeds the game-win tiebreak); a forfeit
  // before any game shows the usual 2-0.
  const keepReal = match.asyncRules && match.gamesCounted > 0
  const done = await lockMatchResult(db, match, {
    outcome: isA ? 'B_WIN' : 'A_WIN', resolution: 'FORFEIT',
    winsA: isA ? match.winsA : (keepReal ? match.winsA : WINS_NEEDED), winsB: isB ? match.winsB : (keepReal ? match.winsB : WINS_NEEDED),
    note: 'Forfeited by a player', now
  })
  return done ? { ok: true } : { ok: false, code: 409, message: 'This match was just decided' }
}

/* ── Deadlines, reminders, disqualifications ─────────────────────────────────────────────── */

export async function processDeadlines(db, now = new Date()) {
  const touched = new Set()
  const decided = []
  await clearStaleLive(db, now)

  // Pairings under the async rules are decided by decideAndLock (below), never by the older both-online rules.
  const due = await db.ogGtoonTournamentMatch.findMany({
    where: {
      asyncRules: false,
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

  // The async pairings whose (extended) deadline has passed: the same decision the exact-time job makes, in case that job was lost.
  const dueAsync = await db.ogGtoonTournamentMatch.findMany({
    where: {
      asyncRules: true, lockedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] }, needsAdmin: false,
      dueAt: { lte: now }, tournament: { status: { in: ACTIVE_STATUSES } }
    },
    select: { id: true, tournamentId: true }, take: 500
  })
  for (const m of dueAsync) {
    const r = await decideAndLock(m.id, { db })
    if (r.decided) { touched.add(m.tournamentId); decided.push({ matchId: m.id, reason: r.why }) }
  }
  // Re-arm the exact-time job for anything due soon (a Redis flush loses delayed jobs; arming is idempotent).
  const soon = await db.ogGtoonTournamentMatch.findMany({
    where: {
      asyncRules: true, lockedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] }, needsAdmin: false,
      dueAt: { gt: now, lte: new Date(now.getTime() + 20 * 60 * 1000) }, tournament: { status: { in: ACTIVE_STATUSES } }
    },
    select: { id: true, dueAt: true }, take: 500
  })
  for (const m of soon) await armOgTournamentDeadline(m.id, m.dueAt).catch(() => {})

  for (const d of decided) {
    try {
      const match = await db.ogGtoonTournamentMatch.findUnique({ where: { id: d.matchId }, include: { tournament: { select: { id: true, name: true } } } })
      if (match) await sendMatchDecidedDMs(db, match, match.tournament, d.reason)
    } catch (err) { console.error('[ogTournament] decided DM failed:', err?.message || err) }
  }
  return [...touched]
}

/**
 * The exact-time job for one async pairing: decide it if its deadline has passed, otherwise (the deadline was extended by a play
 * in the last minute, or an admin moved it) arm again for the new deadline. After a decision the players are told and the
 * tournament advances at once instead of waiting for the next cron run.
 */
export async function runDeadlineJob(db, matchId, { arm = armOgTournamentDeadline } = {}) {
  const r = await decideAndLock(matchId, { db })
  if (r.reason === 'notDue' && r.dueAt) {
    await arm(matchId, r.dueAt)
    return r
  }
  if (!r.decided) return r
  try {
    const match = await db.ogGtoonTournamentMatch.findUnique({ where: { id: matchId }, include: { tournament: { select: { id: true, name: true } } } })
    if (match) await sendMatchDecidedDMs(db, match, match.tournament, r.why)
  } catch (err) { console.error('[ogTournament] decided DM failed:', err?.message || err) }
  await advanceAndNotify(db, r.tournamentId)
  return r
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
      // The pairing was handed out with no more than this much time, so the pairing message already said it. Mark the
      // reminder done (so it is not looked at again) without sending a second message within minutes of the first.
      if (!reminderApplies(m.pairedAt, m.dueAt, hours)) continue
      const items = [[m.playerA, m.playerB], [m.playerB, m.playerA]].map(([me, opp]) => ({
        userId: me.id,
        text: m.asyncRules
          ? reminderAsyncText({ tournamentName: m.tournament.name, oppUsername: opp.username, label, dueText: formatCentral(m.dueAt), link: getOgTournamentUrl(m.tournament.id) })
          : `⏰ ${m.tournament.name}: your match vs ${opp.username} is due in about ${label} (${formatCentral(m.dueAt)}). ` +
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
  if (match.asyncRules) {
    // A reopened pairing gets a fresh ORIGINAL deadline (new games may start against it) and a fresh extension count.
    const reopened = await db.ogGtoonTournamentMatch.findUnique({ where: { id: matchId }, select: { dueAt: true } })
    await db.ogGtoonTournamentMatch.update({ where: { id: matchId }, data: { baseDueAt: reopened.dueAt, extensions: 0, deckProblemSide: null } })
    await armOgTournamentDeadline(matchId, reopened.dueAt).catch(() => {})
  }
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
  // Under the async rules nobody is watching to start the replacement, so it is created here (a Start is sticky).
  if (match.asyncRules) {
    await db.$transaction(async (tx) => {
      if (!(await lockPairing(tx, matchId))) return
      const rows = await tx.$queryRaw`SELECT clock_timestamp() AS now`
      await ensureNextGameInTx(tx, matchId, { now: new Date(rows[0].now) })
    })
  }
  return { ok: true }
}

/** Moves one pairing's deadline later (logged by the caller). */
export async function adminExtendDeadline(db, { tournamentId, matchId, hours }) {
  const h = Math.max(1, Math.min(24 * 14, Math.floor(Number(hours) || 0)))
  const match = await db.ogGtoonTournamentMatch.findUnique({ where: { id: matchId } })
  if (!match || match.tournamentId !== tournamentId) return { ok: false, code: 404, message: 'Match not found' }
  if (match.lockedAt) return { ok: false, code: 400, message: 'This match is already decided' }
  const from = Math.max(Date.now(), match.dueAt ? match.dueAt.getTime() : 0)
  const dueAt = new Date(from + h * HOUR)
  await db.ogGtoonTournamentMatch.update({
    where: { id: matchId },
    data: {
      dueAt, needsAdmin: false, needsAdminReason: null, reminder24SentAt: null, reminder4SentAt: null,
      // An admin extension moves the ORIGINAL deadline too (so a new game can start against it) and starts the extension count over.
      ...(match.asyncRules ? { baseDueAt: dueAt, extensions: 0 } : {})
    }
  })
  if (match.asyncRules) await armOgTournamentDeadline(matchId, dueAt).catch(() => {})
  return { ok: true, hours: h }
}

export async function cancelTournament(db, tournamentId) {
  await db.ogGtoonTournament.update({ where: { id: tournamentId }, data: { status: 'CANCELLED', nextAnnouncementAt: null } })
  // A running async game never counts once the tournament is cancelled.
  await closeTournamentGames(tournamentId, { db })
}

/* ── Prizes ──────────────────────────────────────────────────────────────────────────────── */

export function bundleIsEmpty(b) {
  return !b || (!(Number(b.points) > 0) && !(b.ctoons?.length) && !(b.backgrounds?.length) && !(b.packs?.length))
}

/** The prize bundle a tier pays (null when that tier has none). */
function bundleForTier(tournament, tier) {
  if (tier === 'FIRST') return tournament.firstPrizeJson
  if (tier === 'TOP8') return tournament.top8PrizeJson
  return tournament.participantPrizeJson
}

/** A bundle's packs as clean `[{ packId, quantity }]`: bad rows dropped, the same pack merged. */
function packAwardsOf(bundle) {
  const merged = new Map()
  for (const p of bundle?.packs || []) {
    const quantity = Math.floor(Number(p?.quantity))
    if (!p?.packId || !(quantity >= 1)) continue
    merged.set(p.packId, (merged.get(p.packId) || 0) + quantity)
  }
  return [...merged].map(([packId, quantity]) => ({ packId, quantity }))
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
    hasFirst: !bundleIsEmpty(full.firstPrizeJson), hasTop8: !bundleIsEmpty(full.top8PrizeJson),
    hasParticipant: !bundleIsEmpty(full.participantPrizeJson)
  })
  if (recipients.length) {
    await db.ogGtoonTournamentPrizeGrant.createMany({
      data: recipients.map(r => ({
        tournamentId: tournament.id, userId: r.userId, tier: r.tier, place: r.place,
        status: full.requirePrizeApproval ? 'PENDING_APPROVAL' : 'PENDING',
        rewardJson: bundleForTier(full, r.tier)
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
  // Packs are NOT part of `reward`: handing them to grantRewardInTx would tag them as a cMoon enemy reward and give
  // them no idempotency key or owner log. They are granted below by grantCodePacks, keyed to this grant's id.
  const packAwards = packAwardsOf(grant.rewardJson)
  if (bundleIsEmpty({ points: reward.points, ctoons: reward.ctoons, backgrounds: reward.backgrounds, packs: packAwards })) {
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
      // Same transaction as the PAID claim above: a failure here rolls the claim back, so a pack prize is paid exactly
      // once (and (sourceRef, sourceOrdinal) is unique in the database if anything ever tried to pay it twice).
      let packs = []
      if (packAwards.length) {
        await grantCodePacks(tx, { userId: grant.userId, claimId: grant.id, awards: packAwards, source: 'OG_GTOONS_TOURNAMENT' })
        const rows = await tx.pack.findMany({ where: { id: { in: packAwards.map(p => p.packId) } }, select: { id: true, name: true } })
        const nameById = new Map(rows.map(p => [p.id, p.name]))
        packs = packAwards.map(p => ({ packId: p.packId, name: nameById.get(p.packId) || p.packId, quantity: p.quantity }))
      }
      const requested = reward.ctoons.map(c => ({ name: c.ctoon?.name || c.ctoonId, requested: c.quantity }))
      const granted = new Map(s.ctoonJobs.map(j => [j.name, j.quantity]))
      const shortfall = requested
        .map(r => ({ ...r, granted: granted.get(r.name) || 0 }))
        .filter(r => r.granted < r.requested)
      await tx.ogGtoonTournamentPrizeGrant.update({
        where: { id: grant.id },
        data: {
          summaryJson: {
            points: s.points, backgrounds: s.backgrounds, ctoonJobs: s.ctoonJobs, packs,
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

/* ── Locked decks never change ───────────────────────────────────────────────────────────── */
// There is deliberately no deck repair: the 12 copies registered at opt-in are the deck for the whole tournament.
// They are frozen against trades, auctions, hand-overs and burns (ogGtoonTournamentFreeze.js). A copy that still
// gets out some other way (an admin action) flags the deck, that player cannot play and loses at the deadline.

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
  // Under the async rules a Start never expires; the older rules let it go stale after 30 minutes.
  if (!(m.asyncRules ? mine : isFresh(mine))) return
  await setFlag(flag, 30 * 60)
  await dmUsers(db, [{
    userId: opp.id,
    text: m.asyncRules
      ? `🎮 ${me.username} pressed Start on your ${m.tournament.name} match. Press Start too and the game is created straight away — you don't have to play it right now, ` +
        `just make your moves before the deadline. If you never press Start, they win when time runs out: ${getOgTournamentUrl(m.tournament.id)}`
      : `🎮 ${me.username} is ready to play your ${m.tournament.name} match and is waiting for you. ` +
        `Open your match and press Start next game: ${getOgTournamentUrl(m.tournament.id)}`
  }])
}

/* ── Async games: DMs (queued by the socket server and the deadline job) ──────────────────────── */

const gameLink = (gameId) => gameUrl(baseUrl(), gameId)

async function pairingContext(db, tournamentMatchId) {
  return db.ogGtoonTournamentMatch.findUnique({
    where: { id: tournamentMatchId },
    include: {
      tournament: { select: { id: true, name: true } },
      playerA: { select: { id: true, username: true } },
      playerB: { select: { id: true, username: true } }
    }
  })
}

/** Both players: the link to a game that was just created, its goal cards, how it is decided, and the deadline. Once per player per game. */
export async function sendGameStartedDMs(db, gameId) {
  const game = await db.ogGtoonTournamentGame.findUnique({ where: { id: gameId } })
  if (!game || game.status !== 'ACTIVE') return
  const m = await pairingContext(db, game.tournamentMatchId)
  if (!m || m.lockedAt) return
  const match = restoreMatch(game.state)
  const sides = [m.playerA, m.playerB]
  const items = []
  for (const [idx, me] of sides.entries()) {
    const opp = sides[idx === 0 ? 1 : 0]
    const goal = (i) => { const c = goalCardFor(match, i); return c ? { name: c.name, color: c.color } : null }
    const claimKey = `ogt-game-dm:${gameId}:${me.id}`
    if (!(await claimFlag(claimKey, 14 * 24 * 3600))) continue
    items.push({
      userId: me.id, claimKey,
      text: gameStartedText({
        tournamentName: m.tournament.name, label: match.tournament?.label || 'your match', gameNumber: game.gameNumber,
        me: { username: me.username, goalColor: match.goalColor[idx], goalCard: goal(idx) },
        opp: { username: opp.username, goalColor: match.goalColor[idx === 0 ? 1 : 0], goalCard: goal(idx === 0 ? 1 : 0) },
        link: gameLink(gameId), dueText: m.dueAt ? formatCentral(m.dueAt) : 'the deadline', firstGame: game.gameNumber === 1
      })
    })
  }
  await dmUsers(db, items, { onFail: (item) => clearFlag(item.claimKey) })
}

/**
 * "It's your move" for a player whose opponent just played. Sent a couple of minutes after the play (so live play never sends
 * it) and only if it is still true then: the game is still running and that player still has something to do. At most one per
 * player per pairing every 3 hours; a failed send does not use up the slot.
 */
export async function sendYourTurnDM(db, { gameId, userId }) {
  const game = await db.ogGtoonTournamentGame.findUnique({ where: { id: gameId } })
  if (!game || game.status !== 'ACTIVE') return
  const m = await pairingContext(db, game.tournamentMatchId)
  if (!m || m.lockedAt || !m.asyncRules) return
  const match = restoreMatch(game.state)
  const idx = match.players.indexOf(userId)
  if (idx === -1 || !needsToAct(match, idx)) return
  const claimKey = `ogt-turn-dm:${m.id}:${userId}`
  if (!(await claimFlag(claimKey, 3 * 3600))) return
  const opp = userId === m.playerAUserId ? m.playerB : m.playerA
  await dmUsers(db, [{
    userId, claimKey,
    text: yourTurnText({ tournamentName: m.tournament.name, gameNumber: game.gameNumber, oppUsername: opp.username, link: gameLink(gameId), dueText: m.dueAt ? formatCentral(m.dueAt) : 'the deadline' })
  }], { onFail: (item) => clearFlag(item.claimKey) })
}

/** A locked card left a collection and the next game cannot start: tell the offender what it costs, and the other player what to expect. */
export async function sendDeckProblemDMs(db, tournamentMatchId) {
  const m = await pairingContext(db, tournamentMatchId)
  if (!m || m.lockedAt || !m.deckProblemSide) return
  const side = m.deckProblemSide
  const claimKey = `ogt-deck-dm:${m.id}:${side}`
  if (!(await claimFlag(claimKey, 24 * 3600))) return
  const dueText = m.dueAt ? formatCentral(m.dueAt) : 'the deadline'
  const link = getOgTournamentUrl(m.tournament.id)
  const items = []
  for (const [who, me, opp] of [['A', m.playerA, m.playerB], ['B', m.playerB, m.playerA]]) {
    const mine = side === 'BOTH' || side === who
    items.push({ userId: me.id, text: deckProblemText({ tournamentName: m.tournament.name, mine, oppUsername: opp.username, link, dueText }) })
  }
  await dmUsers(db, items, { onFail: () => clearFlag(claimKey) })
}

/** The match was decided by the game that just ended: tell the player who was not on the board to see it. */
export async function sendAwayDecidedDM(db, { matchId, exceptUserId }) {
  const m = await pairingContext(db, matchId)
  if (!m || !m.lockedAt) return
  const items = []
  for (const [me, opp] of [[m.playerA, m.playerB], [m.playerB, m.playerA]]) {
    if (me.id === exceptUserId) continue
    const claimKey = `ogt-dec-dm:${m.id}:${me.id}`
    if (!(await claimFlag(claimKey, 14 * 24 * 3600))) continue
    items.push({
      userId: me.id, claimKey,
      text: matchDecidedAwayText({ tournamentName: m.tournament.name, won: m.winnerUserId === me.id, oppUsername: opp.username, link: getOgTournamentUrl(m.tournament.id) })
    })
  }
  await dmUsers(db, items, { onFail: (item) => clearFlag(item.claimKey) })
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
