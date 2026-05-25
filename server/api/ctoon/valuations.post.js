import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { Prisma } from '@prisma/client'
import { resolveUserCtoonId } from '@/server/utils/userCtoonId'

export default defineEventHandler(async (event) => {
  // Require authentication
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  const userCtoonIds = body?.userCtoonIds

  if (!Array.isArray(userCtoonIds) || userCtoonIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Missing userCtoonIds' })
  }

  // Sanitize & cap to prevent abuse
  const inputIds = userCtoonIds
    .filter(id => typeof id === 'string' && id.trim())
    .slice(0, 50)

  if (!inputIds.length) return {}

  // Resolve encoded IDs (uc|userId|ctoonId|mintNumber) to real DB UUIDs.
  // Raw UUIDs pass through resolveUserCtoonId unchanged, so this handles both
  // the create-flow (collection API returns encoded IDs) and the modal (trade
  // offer API returns raw UUIDs) transparently.
  const resolved = await Promise.all(
    inputIds.map(async (inputId) => {
      const realId = await resolveUserCtoonId(inputId)
      return { inputId, realId }
    })
  )

  // Drop any IDs that couldn't be resolved
  const validPairs = resolved.filter(p => p.realId)
  if (!validPairs.length) return {}

  const realIds = validPairs.map(p => p.realId)

  // Map real DB UUID → original input ID so we can key the response
  // by whatever format the client sent (encoded or raw)
  const realToInput = new Map(validPairs.map(p => [p.realId, p.inputId]))

  // Fetch all userCtoons with their base ctoon data
  const userCtoons = await prisma.userCtoon.findMany({
    where: { id: { in: realIds } },
    select: {
      id: true,
      ctoonId: true,
      mintNumber: true,
      ctoon: {
        select: {
          id: true,
          name: true,
          price: true,
          quantity: true,
          totalMinted: true,
        }
      }
    }
  })

  if (!userCtoons.length) return {}

  const ctoonIds = [...new Set(userCtoons.map(uc => uc.ctoonId))]

  // Get highest minted mint number per ctoon type (determines the mint range)
  const mintAggs = await prisma.userCtoon.groupBy({
    by: ['ctoonId'],
    where: { ctoonId: { in: ctoonIds } },
    _max: { mintNumber: true }
  })

  const highestMintByCtoonId = new Map(
    mintAggs.map(row => [row.ctoonId, row._max.mintNumber])
  )

  // Get average sale price per ctoon type across all mints
  const avgSaleRows = await prisma.$queryRaw`
    SELECT
      uc."ctoonId",
      ROUND(AVG(a."highestBid")::numeric, 2)::float AS avg_bid
    FROM "Auction" a
    JOIN "UserCtoon" uc ON a."userCtoonId" = uc.id
    WHERE uc."ctoonId" IN (${Prisma.join(ctoonIds)})
      AND a.status = 'CLOSED'
      AND a."winnerId" IS NOT NULL
    GROUP BY uc."ctoonId"
  `

  const avgSaleByCtoonId = new Map(
    avgSaleRows.map(row => [
      row.ctoonId,
      row.avg_bid != null ? Number(row.avg_bid) : null
    ])
  )

  // Build result keyed by the ORIGINAL input ID (encoded or raw) so the
  // client-side lookup — createValuations.value[c.id] — always finds a match
  const result = {}
  for (const uc of userCtoons) {
    const inputId = realToInput.get(uc.id) ?? uc.id
    const highestMint =
      highestMintByCtoonId.get(uc.ctoonId) ??
      uc.ctoon.totalMinted ??
      null

    result[inputId] = {
      ctoonId: uc.ctoonId,
      mintNumber: uc.mintNumber,
      highestMint,
      quantity: uc.ctoon.quantity,
      avgSale: avgSaleByCtoonId.get(uc.ctoonId) ?? null,
      cMartPrice: uc.ctoon.price,
      name: uc.ctoon.name,
    }
  }

  return result
})
