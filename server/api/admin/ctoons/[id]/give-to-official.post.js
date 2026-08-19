// server/api/admin/ctoons/[id]/give-to-official.post.js
//
// One-time admin action: mints 5 more copies of a fully sold-out cToon and
// gives them to the Official system account. Only eligible while
// highestMint === quantity (fully minted) and only once ever per cToon —
// enforced atomically in SQL so a double-click/race can only ever succeed
// once, regardless of what the client's (possibly stale) button state shows.
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

const GIFT_COUNT = 5

export default defineEventHandler(async (event) => {
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
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing cToon id' })

  const officialUsername = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'
  const official = await prisma.user.findUnique({
    where: { username: officialUsername },
    select: { id: true, username: true }
  })
  if (!official) {
    throw createError({ statusCode: 400, statusMessage: `Official account not found: ${officialUsername}` })
  }

  const result = await prisma.$transaction(async (tx) => {
    // Atomic guard: only succeeds if the cToon has a defined (non-null)
    // quantity cap, is fully minted (sold out), and has never been given to
    // Official before. This is the single source of truth for eligibility —
    // the client-side button state is advisory only.
    const rows = await tx.$queryRaw`
      UPDATE "Ctoon"
      SET "totalMinted" = "totalMinted" + ${GIFT_COUNT},
          "quantity" = "quantity" + ${GIFT_COUNT},
          "givenToOfficialAt" = now()
      WHERE id = ${id}
        AND "givenToOfficialAt" IS NULL
        AND "quantity" IS NOT NULL
        AND "totalMinted" = "quantity"
      RETURNING "totalMinted", "quantity", "givenToOfficialAt", "initialQuantity"`

    if (!rows || !rows.length) {
      const existing = await tx.ctoon.findUnique({
        where: { id },
        select: { givenToOfficialAt: true }
      })
      if (!existing) throw createError({ statusCode: 404, statusMessage: 'cToon not found' })
      if (existing.givenToOfficialAt) {
        throw createError({ statusCode: 409, statusMessage: 'This cToon has already been given to Official.' })
      }
      throw createError({ statusCode: 409, statusMessage: 'Not eligible — highest mint must equal quantity (fully sold out).' })
    }

    const { totalMinted: newTotalMinted, quantity: newQuantity, givenToOfficialAt, initialQuantity } = rows[0]
    const startMint = Number(newTotalMinted) - GIFT_COUNT
    const iq = initialQuantity == null ? null : Number(initialQuantity)

    const userCtoonIds = []
    for (let mintNumber = startMint + 1; mintNumber <= Number(newTotalMinted); mintNumber++) {
      const isFirstEdition = iq === null || mintNumber <= iq
      const uc = await tx.userCtoon.create({
        data: { userId: official.id, ctoonId: id, mintNumber, isFirstEdition, pricePaid: null },
        select: { id: true }
      })
      await tx.ctoonOwnerLog.create({
        data: { userId: official.id, ctoonId: id, userCtoonId: uc.id, mintNumber, method: 'ADMIN_GRANT' }
      })
      userCtoonIds.push(uc.id)
    }

    await logAdminChange(tx, {
      userId: me.id,
      area: `Ctoon:${id}`,
      key: 'give-to-official',
      prevValue: null,
      newValue: {
        count: GIFT_COUNT,
        mintNumbers: Array.from({ length: GIFT_COUNT }, (_, i) => startMint + 1 + i),
        userCtoonIds,
        officialUserId: official.id,
        officialUsername: official.username
      },
      targetUserId: official.id,
      targetUsername: official.username
    })

    return {
      id,
      totalMinted: Number(newTotalMinted),
      highestMint: Number(newTotalMinted),
      quantity: Number(newQuantity),
      givenToOfficialAt
    }
  })

  return { success: true, ctoon: result }
})
