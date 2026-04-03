import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'

const DEFAULTS = {
  'Common':       { totalQuantity: 160 },
  'Uncommon':     { totalQuantity: 120 },
  'Rare':         { totalQuantity: 80 },
  'Very Rare':    { totalQuantity: 60 },
  'Crazy Rare':   { totalQuantity: 40 },
  'Auction Only': { totalQuantity: null },
  'Prize Only':   { totalQuantity: null },
  'Code Only':    { totalQuantity: null },
}

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

const TIME_BASED_CAP = 999999999

const worker = new Worker(
  process.env.MINT_END_QUEUE_KEY || 'mintEndQueue',
  async (job) => {
    const { ctoonId } = job.data

    const ctoon = await prisma.ctoon.findUnique({
      where: { id: ctoonId },
      select: { id: true, mintLimitType: true, quantity: true, totalMinted: true, rarity: true },
    })

    if (!ctoon) {
      console.log(`[mint-end] cToon ${ctoonId} not found, skipping`)
      return
    }

    if (ctoon.mintLimitType !== 'timeBased' || ctoon.quantity !== TIME_BASED_CAP) {
      console.log(`[mint-end] cToon ${ctoonId} not in time-based mode or already processed, skipping`)
      return
    }

    // Load rarity defaults (merge hardcoded with DB overrides)
    let rarityDefaultQty = null
    try {
      const cfg = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
      const merged = { ...DEFAULTS, ...(cfg?.rarityDefaults || {}) }
      rarityDefaultQty = merged[ctoon.rarity]?.totalQuantity ?? null
    } catch {
      rarityDefaultQty = DEFAULTS[ctoon.rarity]?.totalQuantity ?? null
    }

    const highestMint = ctoon.totalMinted
    let finalQuantity

    if (rarityDefaultQty !== null) {
      finalQuantity = Math.max(rarityDefaultQty, highestMint)
    } else {
      // Rarity has no default (e.g. Auction Only) — cap at what was actually minted
      finalQuantity = highestMint
    }

    await prisma.ctoon.update({
      where: { id: ctoonId },
      data: {
        quantity: finalQuantity,
        initialQuantity: finalQuantity,
      },
    })

    console.log(
      `[mint-end] cToon ${ctoonId} mint window closed. ` +
      `totalMinted=${highestMint}, rarityDefault=${rarityDefaultQty}, finalQuantity=${finalQuantity}`
    )
  },
  { connection }
)

worker.on('completed', (job) => {
  console.log(`[mint-end] Job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`[mint-end] Job ${job?.id} failed: ${err.message}`)
})

export default worker
