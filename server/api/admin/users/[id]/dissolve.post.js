// server/api/admin/users/[id]/dissolve.post.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

function rarityFloor(rarityRaw) {
  const r = (rarityRaw || '').trim().toLowerCase()
  if (r === 'common') return 25
  if (r === 'uncommon') return 50
  if (r === 'rare') return 100
  if (r === 'very rare') return 187
  if (r === 'crazy rare') return 312
  return 50
}

export default defineEventHandler(async (event) => {
  // 1) Auth: must be admin
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  // Resolve official account
  const officialUsername = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'
  const official = await prisma.user.findUnique({ where: { username: officialUsername } })
  if (!official) {
    throw createError({ statusCode: 400, statusMessage: `Official account not found: ${officialUsername}` })
  }
  if (official.id === id) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot dissolve the Official account' })
  }

  // Load target user
  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      discordId: true,
      username: true,
      isAdmin: true,
      active: true,
      banned: true,
    }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (target.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Cannot dissolve an admin user' })

  // Optional: keep consistent with UI intent — only active users are dissolvable
  if (!target.active) throw createError({ statusCode: 400, statusMessage: 'User is already inactive' })

  const now = new Date()
  const dayMs = 24 * 60 * 60 * 1000
  const endAt = new Date(now.getTime() + dayMs)

  let pointsTransferred = 0
  let ctoonsTransferred = 0
  let auctionsCreated = 0
  let auctionsReassigned = 0
  let bidsReassigned = 0
  let highestReassigned = 0
  let autoBidsReassigned = 0
  let tradeOffersReassigned = 0

  try {
    await prisma.$transaction(async (tx) => {
    // 1) Points transfer from target -> official
    const up = await tx.userPoints.findUnique({ where: { userId: id } })
    const amt = Math.max(0, up?.points || 0)
    if (amt > 0) {
      // zero out target
      await tx.userPoints.update({
        where: { userId: id },
        data: { points: 0, updatedAt: new Date() }
      })
      await tx.pointsLog.create({
        data: { userId: id, direction: 'decrease', points: amt, total: 0, method: 'ACCOUNT_DISSOLVE' }
      })

      // credit official
      const off = await tx.userPoints.upsert({
        where: { userId: official.id },
        update: { points: { increment: amt }, updatedAt: new Date() },
        create: { userId: official.id, points: amt }
      })
      await tx.pointsLog.create({
        data: { userId: official.id, direction: 'increase', points: amt, total: off.points, method: 'ACCOUNT_DISSOLVE' }
      })
      pointsTransferred = amt
    }

    // 2) Reassign or auction cToons
    const userCtoons = await tx.userCtoon.findMany({
      where: { userId: id, burnedAt: null },
      select: { id: true, ctoon: { select: { id: true, rarity: true } }, mintNumber: true }
    })

    for (const uc of userCtoons) {
      const activeAuction = await tx.auction.findFirst({
        where: { userCtoonId: uc.id, status: 'ACTIVE' },
        select: { id: true }
      })

      if (activeAuction) {
        // Skip ownership transfer; reassign creator to official and lock tradeability
        const { count } = await tx.auction.updateMany({
          where: { userCtoonId: uc.id, status: 'ACTIVE' },
          data: { creatorId: official.id }
        })
        auctionsReassigned += count
        await tx.userCtoon.update({ where: { id: uc.id }, data: { isTradeable: false } })
        continue
      }

      // Transfer to official, lock trading
      await tx.userCtoon.update({
        where: { id: uc.id },
        data: { userId: official.id, isTradeable: false }
      })
      await tx.userTradeListItem.deleteMany({
        where: { userCtoonId: uc.id, userId: { not: official.id } }
      })
      await tx.ctoonOwnerLog.create({
        data: {
          userId: official.id,
          userCtoonId: uc.id,
          ctoonId: uc.ctoon?.id ?? null,
          mintNumber: uc.mintNumber ?? null
        }
      })
      ctoonsTransferred++

      // Create a 24h auction under official
      const initialBet = rarityFloor(uc.ctoon?.rarity)
      await tx.auction.create({
        data: {
          userCtoonId: uc.id,
          initialBet,
          duration: 1,
          endAt,
          creatorId: official.id
        }
      })
      auctionsCreated++
    }

    // 3) Reassign any active auctions created by target to official (safety)
    const aRe = await tx.auction.updateMany({ where: { creatorId: id, status: 'ACTIVE' }, data: { creatorId: official.id } })
    auctionsReassigned += aRe.count

    // 4) Reassign this user's bids to official
    const bRe = await tx.bid.updateMany({ where: { userId: id }, data: { userId: official.id } })
    bidsReassigned = bRe.count
    const hbRe = await tx.auction.updateMany({ where: { highestBidderId: id }, data: { highestBidderId: official.id } })
    highestReassigned = hbRe.count

    // 5) Reassign auto-bids — must avoid unique (auctionId, userId)
    const userAutoBids = await tx.auctionAutoBid.findMany({
      where: { userId: id },
      select: { id: true, auctionId: true, maxAmount: true, isActive: true }
    })
    for (const row of userAutoBids) {
      const existing = await tx.auctionAutoBid.findUnique({
        where: { auctionId_userId: { auctionId: row.auctionId, userId: official.id } },
        select: { id: true, maxAmount: true, isActive: true }
      }).catch(() => null)

      if (existing) {
        const newMax = Math.max(existing.maxAmount ?? 0, row.maxAmount ?? 0)
        const newActive = !!(existing.isActive || row.isActive)
        await tx.auctionAutoBid.update({
          where: { id: existing.id },
          data: { maxAmount: newMax, isActive: newActive }
        })
        await tx.auctionAutoBid.delete({ where: { id: row.id } })
        autoBidsReassigned++
      } else {
        await tx.auctionAutoBid.update({ where: { id: row.id }, data: { userId: official.id } })
        autoBidsReassigned++
      }
    }

    // 6) Reassign trade offers (ownership = initiator)
    const toRe = await tx.tradeOffer.updateMany({ where: { initiatorId: id }, data: { initiatorId: official.id } })
    tradeOffersReassigned = toRe.count

    // 7) Set account inactive (do not ban).
    // Also rotate discordId so dissolve is resilient to legacy duplicate rows
    // that can conflict with @@unique([discordId, active]) when active -> false.
    await tx.user.update({
      where: { id },
      data: {
        active: false,
        discordId: `dissolved:${id}:${target.discordId}`,
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null
      }
    })

    // 8) Write account history note (DISSOLVE)
    await tx.userBanNote.create({
      data: {
        userId: id,
        adminId: me.id,
        action: 'DISSOLVE',
        reason: `Account dissolved by ${me.username || me.id}. Points (${pointsTransferred}) moved to ${officialUsername}; cToons transferred to ${officialUsername} and auctions created.`
      }
    })

    // 9) Admin change log (best-effort)
    await logAdminChange(tx, {
      userId: me.id,
      area: 'Admin:Users',
      key: 'dissolveUser',
      prevValue: { active: target.active, banned: target.banned },
      newValue: {
        active: false,
        pointsTransferred,
        ctoonsTransferred,
        auctionsCreated,
        auctionsReassigned,
        bidsReassigned,
        highestReassigned,
        autoBidsReassigned,
        tradeOffersReassigned
      }
    })
  })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        throw createError({
          statusCode: 409,
          statusMessage: 'Dissolve failed: user record conflicts with an existing inactive account. Please contact engineering with this user ID.'
        })
      }
      if (err.code === 'P2003') {
        throw createError({
          statusCode: 409,
          statusMessage: 'Dissolve failed: this user still has linked records (for example a pending trade or active listing) that must be resolved first.'
        })
      }
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Dissolve failed due to a server data consistency issue. Please retry or contact engineering.'
    })
  }

  return {
    ok: true,
    officialUsername,
    summary: {
      pointsTransferred,
      ctoonsTransferred,
      auctionsCreated,
      auctionsReassigned,
      bidsReassigned,
      highestReassigned,
      autoBidsReassigned,
      tradeOffersReassigned
    }
  }
})
