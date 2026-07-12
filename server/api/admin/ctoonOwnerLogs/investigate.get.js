// server/api/admin/ctoonOwnerLogs/investigate.get.js
// Cross-references a CtoonOwnerLog row's user/ctoon/timestamp against other
// tables to surface likely acquisition methods for historical (pre-tracking)
// rows where `method` is null.
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

const DEFAULT_WINDOW_SECONDS = 300
const MIN_WINDOW_SECONDS = 10
const MAX_WINDOW_SECONDS = 3600

export default defineEventHandler(async (event) => {
  // AuthZ: admin only
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const q = getQuery(event)
  const logId = q.id ? String(q.id) : null
  if (!logId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const windowSeconds = Math.min(
    Math.max(parseInt(q.windowSeconds || String(DEFAULT_WINDOW_SECONDS), 10) || DEFAULT_WINDOW_SECONDS, MIN_WINDOW_SECONDS),
    MAX_WINDOW_SECONDS
  )

  const log = await prisma.ctoonOwnerLog.findUnique({
    where: { id: logId },
    select: {
      id: true,
      userId: true,
      ctoonId: true,
      userCtoonId: true,
      mintNumber: true,
      method: true,
      createdAt: true,
      user:  { select: { id: true, username: true } },
      ctoon: { select: { id: true, name: true } },
    }
  })
  if (!log) throw createError({ statusCode: 404, statusMessage: 'Log not found' })
  if (!log.userId || !log.ctoonId) {
    return { log, windowSeconds, candidates: [], activity: [] }
  }

  const { userId, ctoonId } = log
  const at = new Date(log.createdAt)
  const start = new Date(at.getTime() - windowSeconds * 1000)
  const end = new Date(at.getTime() + windowSeconds * 1000)
  const within = { gte: start, lte: end }

  const [
    cmartPurchases,
    packs,
    tradeOffers,
    auctions,
    wheelSpins,
    czoneCaptures,
    holidayRedemptions,
    lottoLogs,
    claims,
    achievements,
    scavengerSessions,
    czoneContestSubs,
    pointsLogs,
  ] = await Promise.all([
    prisma.cmartPurchaseLog.findMany({
      where: { userId, ctoonId, createdAt: within },
      select: { id: true, createdAt: true, saleId: true }
    }),
    prisma.userPack.findMany({
      where: {
        userId,
        mintedCtoons: { some: { ctoonId } },
        OR: [{ openedAt: within }, { createdAt: within }]
      },
      select: { id: true, createdAt: true, openedAt: true, pack: { select: { name: true } } }
    }),
    prisma.tradeOffer.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ initiatorId: userId }, { recipientId: userId }],
        ctoons: { some: { userCtoon: { ctoonId } } },
        updatedAt: within
      },
      select: {
        id: true, updatedAt: true, initiatorId: true, recipientId: true,
        initiator: { select: { username: true } },
        recipient: { select: { username: true } }
      }
    }),
    prisma.auction.findMany({
      where: { winnerId: userId, winnerAt: within, userCtoon: { ctoonId } },
      select: { id: true, winnerAt: true, highestBid: true, creator: { select: { username: true } } }
    }),
    prisma.wheelSpinLog.findMany({
      where: { userId, ctoonId, createdAt: within },
      select: { id: true, createdAt: true, result: true }
    }),
    prisma.cZoneSearchCapture.findMany({
      where: { userId, ctoonId, createdAt: within },
      select: { id: true, createdAt: true }
    }),
    prisma.holidayRedemption.findMany({
      where: { userId, resultCtoonId: ctoonId, redeemedAt: within },
      select: { id: true, redeemedAt: true, event: { select: { name: true } } }
    }),
    log.userCtoonId
      ? prisma.lottoLog.findMany({
          where: { userId, userCtoonId: log.userCtoonId, createdAt: within },
          select: { id: true, createdAt: true, outcome: true }
        })
      : Promise.resolve([]),
    prisma.claim.findMany({
      where: { userId, claimedAt: within },
      select: { id: true, claimedAt: true, code: { select: { code: true } } }
    }),
    prisma.achievementUser.findMany({
      where: { userId, achievedAt: within },
      select: { id: true, achievedAt: true, achievement: { select: { title: true } } }
    }),
    prisma.scavengerSession.findMany({
      where: { userId, ctoonIdAwarded: ctoonId, createdAt: within },
      select: { id: true, createdAt: true, story: { select: { title: true } } }
    }),
    prisma.cZoneContestSubmission.findMany({
      where: { userId, contest: { distributedAt: within } },
      select: { id: true, contest: { select: { id: true, name: true, distributedAt: true, winnerId: true } } }
    }),
    prisma.pointsLog.findMany({
      where: { userId, createdAt: within },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true, method: true, points: true, direction: true }
    }),
  ])

  const candidates = []
  const push = (method, label, ts, detail, counterpartyUsername = null) => {
    candidates.push({
      method,
      label,
      at: ts,
      deltaSeconds: Math.round((new Date(ts).getTime() - at.getTime()) / 1000),
      detail,
      counterpartyUsername
    })
  }

  for (const r of cmartPurchases) push('CMART', 'cMart Purchase', r.createdAt, r.saleId ? 'Purchased during a Sale' : 'Purchased at cMart')
  for (const r of packs) push('PACK', 'Pack Opening', r.openedAt || r.createdAt, `Pack: ${r.pack?.name || 'Unknown pack'}`)
  for (const r of tradeOffers) {
    const counterpartyUsername = r.initiatorId === userId ? r.recipient?.username : r.initiator?.username
    push('TRADE', 'Trade', r.updatedAt, 'Accepted trade offer', counterpartyUsername)
  }
  for (const r of auctions) push('AUCTION', 'Auction Win', r.winnerAt, `Winning bid: ${r.highestBid}`, r.creator?.username || null)
  for (const r of wheelSpins) push('WINWHEEL', 'Win Wheel', r.createdAt, `Spin result: ${r.result}`)
  for (const r of czoneCaptures) push('CZONE_SEARCH', 'cZone Search', r.createdAt, 'Captured via cZone Search')
  for (const r of holidayRedemptions) push('HOLIDAY', 'Holiday Event', r.redeemedAt, `Event: ${r.event?.name || 'Unknown'}`)
  for (const r of lottoLogs) push('LOTTERY', 'Lottery', r.createdAt, `Outcome: ${r.outcome}`)
  for (const r of claims) push('CODE_REDEEM', 'Redeemed Code', r.claimedAt, `Code: ${r.code?.code || 'Unknown'}`)
  for (const r of achievements) push('ACHIEVEMENT', 'Achievement Reward', r.achievedAt, `Achievement: ${r.achievement?.title || 'Unknown'}`)
  for (const r of scavengerSessions) push('SCAVENGER_HUNT', 'Scavenger Hunt', r.createdAt, `Story: ${r.story?.title || 'Unknown'}`)
  for (const r of czoneContestSubs) {
    const isWinner = r.contest?.winnerId === r.id
    push('CZONE_CONTEST', 'cZone Contest', r.contest?.distributedAt, `Contest: ${r.contest?.name || 'Unknown'}${isWinner ? ' (winner)' : ' (participant)'}`)
  }

  candidates.sort((a, b) => Math.abs(a.deltaSeconds) - Math.abs(b.deltaSeconds))

  const activity = pointsLogs.map(p => ({
    at: p.createdAt,
    deltaSeconds: Math.round((new Date(p.createdAt).getTime() - at.getTime()) / 1000),
    method: p.method,
    points: p.points,
    direction: p.direction
  })).sort((a, b) => Math.abs(a.deltaSeconds) - Math.abs(b.deltaSeconds))

  return { log, windowSeconds, candidates, activity }
})
