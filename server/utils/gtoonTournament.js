import { DateTime } from 'luxon'
import { sendGuildChannelMessageById } from './discord.js'

const CENTRAL_TZ = 'America/Chicago'
const ANNOUNCE_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000

function getBaseUrl() {
  return process.env.PUBLIC_BASE_URL || (
    process.env.NODE_ENV === 'production'
      ? 'https://www.cartoonreorbit.com'
      : 'http://localhost:3000'
  )
}

export function getTournamentUrl(tournamentId) {
  const base = getBaseUrl()
  return `${base}/games/clash/tournaments/${tournamentId}`
}

export function formatCentralDateTime(date) {
  const dt = DateTime.fromJSDate(date).setZone(CENTRAL_TZ)
  if (!dt.isValid) return String(date)
  return dt.toFormat('LLL d, yyyy h:mm a ZZZ')
}

export function getCentralMidnight(date) {
  const dt = DateTime.fromJSDate(date).setZone(CENTRAL_TZ).startOf('day')
  return dt.toUTC().toJSDate()
}

function pairKey(a, b) {
  return [a, b].sort().join(':')
}

function sortSwissRecords(a, b) {
  return (
    (b.points - a.points) ||
    (b.opponentMatchWinPct - a.opponentMatchWinPct) ||
    (b.gameWinPct - a.gameWinPct) ||
    String(a.userId).localeCompare(String(b.userId))
  )
}

export async function sendTournamentAnnouncement(db, tournament) {
  const channelId = (tournament.announcementChannelId || '').trim() || process.env.DISCORD_ANNOUNCEMENT_CHANNEL
  const botToken = process.env.DISCORD_ANNOUNCEMENTS_BOT_TOKEN || process.env.BOT_TOKEN
  if (!channelId || !botToken) return false

  const optInCount = await db.gtoonTournamentOptIn.count({
    where: { tournamentId: tournament.id, isActive: true }
  })

  const startText = formatCentralDateTime(tournament.optInStartAt)
  const endText = formatCentralDateTime(tournament.optInEndAt)
  const link = getTournamentUrl(tournament.id)

  const lines = [
    `🏆 ${tournament.name} — gToons Clash Tournament`,
    `• Opt-in: ${startText} → ${endText} (${CENTRAL_TZ})`,
    `• Current opt-ins: ${optInCount}`,
    `• Join: ${link}`
  ]

  return await sendGuildChannelMessageById(channelId, lines.join('\n'), botToken)
}

export async function processTournamentAnnouncements(db, now = new Date()) {
  const tournaments = await db.gtoonTournament.findMany({
    where: { status: 'OPT_IN_OPEN' }
  })

  for (const tournament of tournaments) {
    const midnight = getCentralMidnight(tournament.optInEndAt)

    if (!tournament.finalOptInMidnightAnnouncementSent && now >= midnight) {
      const claimed = await db.gtoonTournament.updateMany({
        where: { id: tournament.id, finalOptInMidnightAnnouncementSent: false },
        data: {
          finalOptInMidnightAnnouncementSent: true,
          lastAnnouncementAt: now
        }
      })
      if (claimed.count) {
        await sendTournamentAnnouncement(db, tournament)
      }
    }

    if (tournament.nextAnnouncementAt && now >= tournament.nextAnnouncementAt) {
      const nextCandidate = new Date(tournament.nextAnnouncementAt.getTime() + ANNOUNCE_INTERVAL_MS)
      const nextAnnouncementAt = nextCandidate <= tournament.optInEndAt ? nextCandidate : null

      const claimed = await db.gtoonTournament.updateMany({
        where: {
          id: tournament.id,
          nextAnnouncementAt: tournament.nextAnnouncementAt
        },
        data: {
          lastAnnouncementAt: now,
          nextAnnouncementAt
        }
      })

      if (claimed.count) {
        await sendTournamentAnnouncement(db, tournament)
      }
    }
  }
}

function resolveBattleOutcome(battle, playerAUserId, playerBUserId) {
  if (!battle || (!battle.winnerUserId && battle.outcome !== 'tie')) return null
  if (battle.outcome === 'tie' || !battle.winnerUserId) {
    return { winner: null, isTie: true }
  }
  if (battle.winnerUserId === playerAUserId) return { winner: 'A', isTie: false }
  if (battle.winnerUserId === playerBUserId) return { winner: 'B', isTie: false }
  return null
}

function computeMatchFromBattles(match, battles, maxSuddenDeathGames) {
  const bestOf = Math.max(1, Number(match.bestOf || 3))
  const winsNeeded = Math.ceil(bestOf / 2)
  let winsA = 0
  let winsB = 0
  let ties = 0
  const sourceBattleIds = []
  let baseCount = 0

  for (const battle of battles) {
    if (baseCount >= bestOf || winsA >= winsNeeded || winsB >= winsNeeded) break
    const outcome = resolveBattleOutcome(battle, match.playerAUserId, match.playerBUserId)
    if (!outcome) continue
    if (outcome.isTie) ties += 1
    else if (outcome.winner === 'A') winsA += 1
    else if (outcome.winner === 'B') winsB += 1
    baseCount += 1
    sourceBattleIds.push(battle.id)
  }

  let outcome = null
  let winnerUserId = null
  let status = match.status
  let suddenDeathGamesCounted = 0
  let tiebreakNotes = match.tiebreakNotes || null
  let tiebreakMethod = match.tiebreakMethod || null
  let tiebreakResolvedAt = match.tiebreakResolvedAt || null

  if (winsA >= winsNeeded) {
    outcome = 'A_WIN'
    winnerUserId = match.playerAUserId
  } else if (winsB >= winsNeeded) {
    outcome = 'B_WIN'
    winnerUserId = match.playerBUserId
  } else if (baseCount >= bestOf) {
    outcome = 'TIE'
  }

  const needsSuddenDeath =
    match.stage === 'BRACKET' &&
    match.requiresWinner &&
    outcome === 'TIE'

  if (needsSuddenDeath) {
    tiebreakMethod = 'SUDDEN_DEATH'
    tiebreakNotes = null
    for (let i = baseCount; i < battles.length; i += 1) {
      if (suddenDeathGamesCounted >= maxSuddenDeathGames) break
      const battle = battles[i]
      const outcomeInfo = resolveBattleOutcome(battle, match.playerAUserId, match.playerBUserId)
      if (!outcomeInfo) continue
      if (outcomeInfo.isTie) {
        ties += 1
        suddenDeathGamesCounted += 1
        sourceBattleIds.push(battle.id)
        continue
      }
      if (outcomeInfo.winner === 'A') {
        winsA += 1
        outcome = 'A_WIN'
        winnerUserId = match.playerAUserId
        tiebreakResolvedAt = new Date()
      } else if (outcomeInfo.winner === 'B') {
        winsB += 1
        outcome = 'B_WIN'
        winnerUserId = match.playerBUserId
        tiebreakResolvedAt = new Date()
      }
      suddenDeathGamesCounted += 1
      sourceBattleIds.push(battle.id)
      break
    }

    if (outcome === 'TIE') {
      if (suddenDeathGamesCounted >= maxSuddenDeathGames) {
        tiebreakNotes = 'Sudden death cap reached; requires admin resolution'
      }
      status = 'IN_PROGRESS'
    }
  }

  if (outcome === 'A_WIN' || outcome === 'B_WIN') {
    status = 'COMPLETE'
  } else if (outcome === 'TIE' && match.stage === 'SWISS') {
    status = 'COMPLETE'
  } else if (baseCount > 0 && status === 'PENDING') {
    status = 'IN_PROGRESS'
  }

  const gamesCounted = winsA + winsB + ties

  return {
    winsA,
    winsB,
    ties,
    gamesCounted,
    outcome,
    winnerUserId,
    status,
    sourceBattleIds,
    suddenDeathGamesCounted,
    tiebreakMethod,
    tiebreakNotes,
    tiebreakResolvedAt
  }
}

export async function resolveTournamentMatches(db, { tournamentId } = {}) {
  const where = {
    lockedAt: null,
    status: { in: ['PENDING', 'IN_PROGRESS'] }
  }
  if (tournamentId) where.tournamentId = tournamentId

  const matches = await db.gtoonTournamentMatch.findMany({
    where,
    include: {
      tournament: {
        select: {
          id: true,
          bestOf: true,
          maxSuddenDeathGames: true,
          status: true
        }
      }
    }
  })

  const touchedTournamentIds = new Set()

  for (const match of matches) {
    if (!match.tournament) continue
    if (match.status === 'BYE') continue

    const battles = await db.clashGame.findMany({
      where: {
        startedAt: { gte: match.pairedAt },
        endedAt: { not: null },
        player1UserId: { in: [match.playerAUserId, match.playerBUserId] },
        player2UserId: { in: [match.playerAUserId, match.playerBUserId] }
      },
      orderBy: { startedAt: 'asc' }
    })

    const computed = computeMatchFromBattles(
      match,
      battles,
      Math.max(1, Number(match.tournament.maxSuddenDeathGames || 10))
    )

    const updateData = {
      winsA: computed.winsA,
      winsB: computed.winsB,
      ties: computed.ties,
      gamesCounted: computed.gamesCounted,
      outcome: computed.outcome,
      winnerUserId: computed.winnerUserId,
      status: computed.status,
      sourceBattleIdsJson: computed.sourceBattleIds,
      suddenDeathGamesCounted: computed.suddenDeathGamesCounted,
      tiebreakMethod: computed.tiebreakMethod,
      tiebreakNotes: computed.tiebreakNotes,
      tiebreakResolvedAt: computed.tiebreakResolvedAt
    }

    const isComplete = computed.status === 'COMPLETE'
    if (isComplete) {
      updateData.completedAt = new Date()
      updateData.lockedAt = new Date()
    }

    const claimed = await db.gtoonTournamentMatch.updateMany({
      where: { id: match.id, lockedAt: null },
      data: updateData
    })

    if (claimed.count) {
      touchedTournamentIds.add(match.tournamentId)
    }
  }

  for (const id of touchedTournamentIds) {
    await recomputeTournamentRecords(db, id)
  }
}

export async function recomputeTournamentRecords(db, tournamentId) {
  const optIns = await db.gtoonTournamentOptIn.findMany({
    where: { tournamentId, isActive: true },
    select: { userId: true }
  })
  const userIds = optIns.map(row => row.userId)
  if (!userIds.length) return

  const records = new Map()
  for (const userId of userIds) {
    records.set(userId, {
      userId,
      swissWins: 0,
      swissLosses: 0,
      swissTies: 0,
      swissByes: 0,
      bracketWins: 0,
      bracketLosses: 0,
      points: 0,
      swissGameWins: 0,
      swissGameLosses: 0,
      swissGameTies: 0,
      opponentMatchWinPct: 0,
      gameWinPct: 0
    })
  }

  const swissMatches = await db.gtoonTournamentMatch.findMany({
    where: {
      tournamentId,
      stage: 'SWISS',
      status: { in: ['COMPLETE', 'BYE'] }
    }
  })

  const opponentsByUser = new Map()

  for (const match of swissMatches) {
    const a = match.playerAUserId
    const b = match.playerBUserId
    const recA = records.get(a)
    const recB = records.get(b)
    if (!recA) continue

    if (match.status === 'BYE' || a === b) {
      recA.swissByes += 1
      recA.points += 3
      continue
    }

    if (recB) {
      const listA = opponentsByUser.get(a) || []
      listA.push(b)
      opponentsByUser.set(a, listA)
      const listB = opponentsByUser.get(b) || []
      listB.push(a)
      opponentsByUser.set(b, listB)
    }

    if (match.outcome === 'A_WIN') {
      recA.swissWins += 1
      recA.points += 3
      if (recB) recB.swissLosses += 1
    } else if (match.outcome === 'B_WIN') {
      if (recB) {
        recB.swissWins += 1
        recB.points += 3
      }
      recA.swissLosses += 1
    } else if (match.outcome === 'TIE') {
      recA.swissTies += 1
      recA.points += 1
      if (recB) {
        recB.swissTies += 1
        recB.points += 1
      }
    }

    recA.swissGameWins += match.winsA
    recA.swissGameLosses += match.winsB
    recA.swissGameTies += match.ties
    if (recB) {
      recB.swissGameWins += match.winsB
      recB.swissGameLosses += match.winsA
      recB.swissGameTies += match.ties
    }
  }

  const bracketMatches = await db.gtoonTournamentMatch.findMany({
    where: {
      tournamentId,
      stage: 'BRACKET',
      status: { in: ['COMPLETE', 'BYE'] }
    }
  })

  for (const match of bracketMatches) {
    const a = match.playerAUserId
    const b = match.playerBUserId
    const recA = records.get(a)
    const recB = records.get(b)
    if (!recA) continue

    if (match.status === 'BYE' || a === b) {
      recA.bracketWins += 1
      continue
    }

    if (match.winnerUserId === a) {
      recA.bracketWins += 1
      if (recB) recB.bracketLosses += 1
    } else if (match.winnerUserId === b) {
      if (recB) recB.bracketWins += 1
      recA.bracketLosses += 1
    }
  }

  for (const rec of records.values()) {
    const totalGames = rec.swissGameWins + rec.swissGameLosses + rec.swissGameTies
    rec.gameWinPct = totalGames > 0
      ? (rec.swissGameWins + 0.5 * rec.swissGameTies) / totalGames
      : 0
  }

  for (const rec of records.values()) {
    const opponents = opponentsByUser.get(rec.userId) || []
    if (!opponents.length) {
      rec.opponentMatchWinPct = 0
      continue
    }

    let total = 0
    for (const oppId of opponents) {
      const opp = records.get(oppId)
      if (!opp) continue
      const rounds = opp.swissWins + opp.swissLosses + opp.swissTies + opp.swissByes
      const maxPoints = Math.max(1, rounds * 3)
      total += opp.points / maxPoints
    }
    rec.opponentMatchWinPct = total / opponents.length
  }

  const now = new Date()
  await db.$transaction(async (tx) => {
    for (const rec of records.values()) {
      await tx.gtoonTournamentPlayerRecord.upsert({
        where: {
          tournamentId_userId: {
            tournamentId,
            userId: rec.userId
          }
        },
        create: {
          tournamentId,
          userId: rec.userId,
          swissWins: rec.swissWins,
          swissLosses: rec.swissLosses,
          swissTies: rec.swissTies,
          swissByes: rec.swissByes,
          bracketWins: rec.bracketWins,
          bracketLosses: rec.bracketLosses,
          points: rec.points,
          swissGameWins: rec.swissGameWins,
          swissGameLosses: rec.swissGameLosses,
          swissGameTies: rec.swissGameTies,
          opponentMatchWinPct: rec.opponentMatchWinPct,
          gameWinPct: rec.gameWinPct,
          lastUpdatedAt: now
        },
        update: {
          swissWins: rec.swissWins,
          swissLosses: rec.swissLosses,
          swissTies: rec.swissTies,
          swissByes: rec.swissByes,
          bracketWins: rec.bracketWins,
          bracketLosses: rec.bracketLosses,
          points: rec.points,
          swissGameWins: rec.swissGameWins,
          swissGameLosses: rec.swissGameLosses,
          swissGameTies: rec.swissGameTies,
          opponentMatchWinPct: rec.opponentMatchWinPct,
          gameWinPct: rec.gameWinPct,
          lastUpdatedAt: now
        }
      })
    }
  })
}

async function createSwissRound(db, tournament, roundNumber) {
  const records = await db.gtoonTournamentPlayerRecord.findMany({
    where: { tournamentId: tournament.id },
    select: {
      userId: true,
      points: true,
      opponentMatchWinPct: true,
      gameWinPct: true,
      swissByes: true
    }
  })

  const sorted = records.slice().sort(sortSwissRecords)
  const players = sorted.map(r => r.userId)

  let byeUserId = null
  if (players.length % 2 === 1) {
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      if (!sorted[i].swissByes) {
        byeUserId = sorted[i].userId
        break
      }
    }
    if (!byeUserId) byeUserId = sorted[sorted.length - 1]?.userId || null
  }

  const previousMatches = await db.gtoonTournamentMatch.findMany({
    where: {
      tournamentId: tournament.id,
      stage: 'SWISS',
      status: { in: ['COMPLETE', 'BYE'] }
    },
    select: { playerAUserId: true, playerBUserId: true }
  })
  const previousPairs = new Set()
  for (const match of previousMatches) {
    if (!match.playerAUserId || !match.playerBUserId) continue
    if (match.playerAUserId === match.playerBUserId) continue
    previousPairs.add(pairKey(match.playerAUserId, match.playerBUserId))
  }

  const available = players.filter(id => id !== byeUserId)
  const pairs = []
  while (available.length > 1) {
    const a = available.shift()
    let pickIndex = available.findIndex(b => !previousPairs.has(pairKey(a, b)))
    if (pickIndex === -1) pickIndex = 0
    const [b] = available.splice(pickIndex, 1)
    pairs.push([a, b])
  }

  const round = await db.gtoonTournamentRound.create({
    data: {
      tournamentId: tournament.id,
      stage: 'SWISS',
      roundNumber
    }
  })

  const now = new Date()
  const matchRows = []
  let tableNumber = 1
  for (const [playerAUserId, playerBUserId] of pairs) {
    matchRows.push({
      tournamentId: tournament.id,
      roundId: round.id,
      stage: 'SWISS',
      roundNumber,
      tableNumber,
      playerAUserId,
      playerBUserId,
      status: 'PENDING',
      bestOf: tournament.bestOf,
      requiresWinner: false,
      pairedAt: now
    })
    tableNumber += 1
  }

  if (byeUserId) {
    matchRows.push({
      tournamentId: tournament.id,
      roundId: round.id,
      stage: 'SWISS',
      roundNumber,
      tableNumber: null,
      playerAUserId: byeUserId,
      playerBUserId: byeUserId,
      status: 'BYE',
      bestOf: tournament.bestOf,
      winsA: 0,
      winsB: 0,
      ties: 0,
      gamesCounted: 0,
      outcome: 'A_WIN',
      winnerUserId: byeUserId,
      requiresWinner: false,
      pairedAt: now,
      completedAt: now,
      lockedAt: now
    })
  }

  if (matchRows.length) {
    await db.gtoonTournamentMatch.createMany({ data: matchRows })
  }
}

function buildBracketSeedPairs(bracketSize) {
  const pairs = []
  for (let i = 1; i <= bracketSize / 2; i += 1) {
    pairs.push([i, bracketSize + 1 - i])
  }
  return pairs
}

async function createBracketRound(db, tournament, roundNumber, pairs, seedMap) {
  const round = await db.gtoonTournamentRound.create({
    data: {
      tournamentId: tournament.id,
      stage: 'BRACKET',
      roundNumber
    }
  })

  const now = new Date()
  const matchRows = []
  let tableNumber = 1

  for (const [seedA, seedB] of pairs) {
    const playerAUserId = seedMap.get(seedA) || null
    const playerBUserId = seedMap.get(seedB) || null

    if (playerAUserId && playerBUserId) {
      matchRows.push({
        tournamentId: tournament.id,
        roundId: round.id,
        stage: 'BRACKET',
        roundNumber,
        tableNumber,
        playerAUserId,
        playerBUserId,
        status: 'PENDING',
        bestOf: tournament.bestOf,
        requiresWinner: true,
        tiebreakMethod: 'SUDDEN_DEATH',
        pairedAt: now,
        seedA,
        seedB
      })
    } else {
      const winnerId = playerAUserId || playerBUserId
      if (!winnerId) {
        tableNumber += 1
        continue
      }
      matchRows.push({
        tournamentId: tournament.id,
        roundId: round.id,
        stage: 'BRACKET',
        roundNumber,
        tableNumber,
        playerAUserId: winnerId,
        playerBUserId: winnerId,
        status: 'BYE',
        bestOf: tournament.bestOf,
        outcome: 'A_WIN',
        winnerUserId: winnerId,
        requiresWinner: false,
        pairedAt: now,
        completedAt: now,
        lockedAt: now,
        seedA,
        seedB
      })
    }
    tableNumber += 1
  }

  if (matchRows.length) {
    await db.gtoonTournamentMatch.createMany({ data: matchRows })
  }
}

async function createBracketForOptIns(db, tournament, optIns) {
  const sorted = optIns.slice().sort((a, b) => {
    const aTime = a.optedInAt ? new Date(a.optedInAt).getTime() : 0
    const bTime = b.optedInAt ? new Date(b.optedInAt).getTime() : 0
    return aTime - bTime || String(a.userId).localeCompare(String(b.userId))
  })

  const players = sorted.map(row => row.userId)
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(players.length)))
  const seedMap = new Map()
  players.forEach((userId, idx) => {
    seedMap.set(idx + 1, userId)
  })

  const pairs = buildBracketSeedPairs(bracketSize)
  await createBracketRound(db, tournament, 1, pairs, seedMap)
}

async function createTop8Bracket(db, tournament) {
  const records = await db.gtoonTournamentPlayerRecord.findMany({
    where: { tournamentId: tournament.id }
  })
  const sorted = records.slice().sort(sortSwissRecords)
  const top8 = sorted.slice(0, 8)
  if (top8.length < 2) return

  const seedMap = new Map()
  top8.forEach((rec, idx) => {
    seedMap.set(idx + 1, rec.userId)
  })

  const pairs = buildBracketSeedPairs(8)
  await createBracketRound(db, tournament, 1, pairs, seedMap)
}

export async function processTournamentStateTransitions(db, now = new Date()) {
  const toOpen = await db.gtoonTournament.findMany({
    where: {
      status: 'DRAFT',
      optInStartAt: { lte: now }
    }
  })

  for (const tournament of toOpen) {
    await db.gtoonTournament.updateMany({
      where: { id: tournament.id, status: 'DRAFT' },
      data: {
        status: 'OPT_IN_OPEN',
        nextAnnouncementAt: tournament.optInStartAt,
        lastAnnouncementAt: null,
        finalOptInMidnightAnnouncementSent: false
      }
    })
  }

  const toClose = await db.gtoonTournament.findMany({
    where: {
      status: 'OPT_IN_OPEN',
      optInEndAt: { lte: now }
    }
  })

  for (const tournament of toClose) {
    await db.$transaction(async (tx) => {
      const closed = await tx.gtoonTournament.updateMany({
        where: { id: tournament.id, status: 'OPT_IN_OPEN' },
        data: { status: 'OPT_IN_CLOSED', nextAnnouncementAt: null }
      })
      if (!closed.count) return

      const optIns = await tx.gtoonTournamentOptIn.findMany({
        where: { tournamentId: tournament.id, isActive: true },
        select: { userId: true, optedInAt: true }
      })

      if (optIns.length) {
        await tx.gtoonTournamentPlayerRecord.createMany({
          data: optIns.map(row => ({ tournamentId: tournament.id, userId: row.userId })),
          skipDuplicates: true
        })
      }

      if (optIns.length < 2) {
        await tx.gtoonTournament.update({
          where: { id: tournament.id },
          data: { status: 'CANCELLED' }
        })
        return
      }

      if (optIns.length <= 8) {
        await tx.gtoonTournament.update({
          where: { id: tournament.id },
          data: {
            status: 'BRACKET_ACTIVE',
            format: 'BRACKET_8_OR_LESS'
          }
        })
        await createBracketForOptIns(tx, tournament, optIns)
      } else {
        await tx.gtoonTournament.update({
          where: { id: tournament.id },
          data: {
            status: 'SWISS_ACTIVE',
            format: 'SWISS_THEN_TOP8'
          }
        })
        const existingRound = await tx.gtoonTournamentRound.findFirst({
          where: { tournamentId: tournament.id, stage: 'SWISS', roundNumber: 1 },
          select: { id: true }
        })
        if (!existingRound) {
          await createSwissRound(tx, tournament, 1)
        }
      }
    })
  }
}

export async function advanceSwissRounds(db, { tournamentId } = {}) {
  const where = { status: 'SWISS_ACTIVE' }
  if (tournamentId) where.id = tournamentId

  const tournaments = await db.gtoonTournament.findMany({ where })

  for (const tournament of tournaments) {
    const currentRound = await db.gtoonTournamentRound.findFirst({
      where: { tournamentId: tournament.id, stage: 'SWISS' },
      orderBy: { roundNumber: 'desc' }
    })
    if (!currentRound) continue

    const incomplete = await db.gtoonTournamentMatch.count({
      where: {
        tournamentId: tournament.id,
        stage: 'SWISS',
        roundNumber: currentRound.roundNumber,
        status: { notIn: ['COMPLETE', 'BYE'] }
      }
    })
    if (incomplete > 0) continue

    await recomputeTournamentRecords(db, tournament.id)

    if (currentRound.roundNumber >= tournament.swissRounds) {
      const existingBracket = await db.gtoonTournamentRound.findFirst({
        where: { tournamentId: tournament.id, stage: 'BRACKET' }
      })
      if (!existingBracket) {
        await db.$transaction(async (tx) => {
          await tx.gtoonTournament.update({
            where: { id: tournament.id },
            data: { status: 'BRACKET_ACTIVE' }
          })
          await createTop8Bracket(tx, tournament)
        })
      }
      continue
    }

    const nextRoundNumber = currentRound.roundNumber + 1
    const existingNext = await db.gtoonTournamentRound.findFirst({
      where: {
        tournamentId: tournament.id,
        stage: 'SWISS',
        roundNumber: nextRoundNumber
      }
    })
    if (!existingNext) {
      await createSwissRound(db, tournament, nextRoundNumber)
    }
  }
}

async function buildFinalPlacements(db, tournament) {
  const records = await db.gtoonTournamentPlayerRecord.findMany({
    where: { tournamentId: tournament.id },
    include: { user: { select: { id: true, username: true } } }
  })

  const recordByUser = new Map(records.map(r => [r.userId, r]))
  const swissSorted = records.slice().sort(sortSwissRecords)

  const bracketMatches = await db.gtoonTournamentMatch.findMany({
    where: { tournamentId: tournament.id, stage: 'BRACKET', status: { in: ['COMPLETE', 'BYE'] } },
    orderBy: { roundNumber: 'asc' }
  })

  if (!bracketMatches.length) return []

  const finalRound = Math.max(...bracketMatches.map(m => m.roundNumber))
  const finals = bracketMatches.filter(m => m.roundNumber === finalRound)
  const finalMatch = finals[0]
  if (!finalMatch || !finalMatch.winnerUserId) return []

  const winnerId = finalMatch.winnerUserId
  const runnerUpId = finalMatch.playerAUserId === winnerId
    ? finalMatch.playerBUserId
    : finalMatch.playerAUserId

  const eliminationRound = new Map()
  const bracketPlayers = new Set()
  for (const match of bracketMatches) {
    if (match.playerAUserId) bracketPlayers.add(match.playerAUserId)
    if (match.playerBUserId) bracketPlayers.add(match.playerBUserId)
    if (match.status === 'BYE') continue
    if (!match.winnerUserId) continue
    const loser = match.playerAUserId === match.winnerUserId
      ? match.playerBUserId
      : match.playerAUserId
    if (loser && !eliminationRound.has(loser)) {
      eliminationRound.set(loser, match.roundNumber)
    }
  }

  const seedByUser = new Map()
  for (const match of bracketMatches) {
    if (match.roundNumber !== 1) continue
    if (match.seedA && match.playerAUserId) seedByUser.set(match.playerAUserId, match.seedA)
    if (match.seedB && match.playerBUserId) seedByUser.set(match.playerBUserId, match.seedB)
  }

  const remaining = Array.from(bracketPlayers)
    .filter(id => id && id !== winnerId && id !== runnerUpId)

  remaining.sort((a, b) => {
    const elimA = eliminationRound.get(a) || 0
    const elimB = eliminationRound.get(b) || 0
    if (elimA !== elimB) return elimB - elimA

    if (tournament.format === 'SWISS_THEN_TOP8') {
      const recA = recordByUser.get(a)
      const recB = recordByUser.get(b)
      return sortSwissRecords(recA, recB)
    }

    const seedA = seedByUser.get(a) || 999
    const seedB = seedByUser.get(b) || 999
    return seedA - seedB
  })

  const placements = []

  const addPlacement = (userId, place) => {
    const rec = recordByUser.get(userId)
    if (!rec) return
    placements.push({
      userId: rec.userId,
      username: rec.user?.username || 'Unknown',
      place,
      swissWins: rec.swissWins,
      swissLosses: rec.swissLosses,
      swissTies: rec.swissTies,
      bracketWins: rec.bracketWins,
      bracketLosses: rec.bracketLosses,
      points: rec.points,
      opponentMatchWinPct: rec.opponentMatchWinPct,
      gameWinPct: rec.gameWinPct
    })
  }

  addPlacement(winnerId, 1)
  if (runnerUpId) addPlacement(runnerUpId, 2)

  let place = 3
  for (const userId of remaining) {
    addPlacement(userId, place)
    place += 1
  }

  if (tournament.format === 'SWISS_THEN_TOP8') {
    const inBracket = new Set([winnerId, runnerUpId, ...remaining])
    const others = swissSorted
      .map(r => r.userId)
      .filter(id => id && !inBracket.has(id))

    for (const userId of others) {
      addPlacement(userId, place)
      place += 1
    }
  }

  return placements
}

export async function advanceBracketRounds(db, { tournamentId } = {}) {
  const where = { status: 'BRACKET_ACTIVE' }
  if (tournamentId) where.id = tournamentId

  const tournaments = await db.gtoonTournament.findMany({ where })

  for (const tournament of tournaments) {
    const rounds = await db.gtoonTournamentRound.findMany({
      where: { tournamentId: tournament.id, stage: 'BRACKET' },
      orderBy: { roundNumber: 'asc' }
    })
    if (!rounds.length) continue

    const lastRound = rounds[rounds.length - 1]
    const incomplete = await db.gtoonTournamentMatch.count({
      where: {
        tournamentId: tournament.id,
        stage: 'BRACKET',
        roundNumber: lastRound.roundNumber,
        status: { notIn: ['COMPLETE', 'BYE'] }
      }
    })
    if (incomplete > 0) continue

    const lastRoundMatches = await db.gtoonTournamentMatch.findMany({
      where: {
        tournamentId: tournament.id,
        stage: 'BRACKET',
        roundNumber: lastRound.roundNumber
      },
      orderBy: { tableNumber: 'asc' }
    })

    if (lastRoundMatches.length <= 1) {
      await recomputeTournamentRecords(db, tournament.id)
      const placements = await buildFinalPlacements(db, tournament)
      const winnerId = placements[0]?.userId || null
      await db.gtoonTournament.update({
        where: { id: tournament.id },
        data: {
          status: 'COMPLETE',
          winnerUserId: winnerId,
          finalizedAt: new Date(),
          tournamentCompletedAt: new Date(),
          finalPlacementsJson: placements
        }
      })
      continue
    }

    const winners = []
    for (const match of lastRoundMatches) {
      if (match.status === 'BYE') {
        winners.push(match.playerAUserId)
        continue
      }
      if (match.winnerUserId) winners.push(match.winnerUserId)
    }

    if (winners.length < 2) continue

    const nextRoundNumber = lastRound.roundNumber + 1
    const existingNext = await db.gtoonTournamentRound.findFirst({
      where: {
        tournamentId: tournament.id,
        stage: 'BRACKET',
        roundNumber: nextRoundNumber
      }
    })
    if (existingNext) continue

    const nextRound = await db.gtoonTournamentRound.create({
      data: {
        tournamentId: tournament.id,
        stage: 'BRACKET',
        roundNumber: nextRoundNumber
      }
    })

    const now = new Date()
    const matchRows = []
    let tableNumber = 1
    for (let i = 0; i < winners.length; i += 2) {
      const playerAUserId = winners[i]
      const playerBUserId = winners[i + 1]
      if (!playerAUserId || !playerBUserId) continue
      matchRows.push({
        tournamentId: tournament.id,
        roundId: nextRound.id,
        stage: 'BRACKET',
        roundNumber: nextRoundNumber,
        tableNumber,
        playerAUserId,
        playerBUserId,
        status: 'PENDING',
        bestOf: tournament.bestOf,
        requiresWinner: true,
        tiebreakMethod: 'SUDDEN_DEATH',
        pairedAt: now
      })
      tableNumber += 1
    }

    if (matchRows.length) {
      await db.gtoonTournamentMatch.createMany({ data: matchRows })
    }
  }
}

export async function runTournamentScheduler(db) {
  await processTournamentStateTransitions(db)
  await processTournamentAnnouncements(db)
  await resolveTournamentMatches(db)
  await advanceSwissRounds(db)
  await advanceBracketRounds(db)
}
