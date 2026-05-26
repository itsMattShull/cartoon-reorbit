// server/workers/content-analyzer.worker.js
// Processes survey text answers: extracts stylometric features and MinHash
// signature, then stores results back on the SurveyAnswers row.
//
// Embeddings via @xenova/transformers can be added later once confirmed
// available on the target server; for now all analysis is pure JS.

import { Worker } from 'bullmq'
import { prisma }  from '../prisma.js'

const connection = {
  host:     process.env.REDIS_HOST     || 'localhost',
  port:     Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
}

// ── MinHash (128 permutations, word-level shingles) ───────────────────────────

const NUM_PERMS = 128
const MERSENNE_PRIME = (1n << 61n) - 1n
const MAX_HASH = (1n << 32n) - 1n

// Pre-generate stable a/b coefficients deterministically
function makeCoefficients(seed) {
  // Simple LCG seeded per permutation
  const a = [], b = []
  let s = BigInt(seed)
  for (let i = 0; i < NUM_PERMS; i++) {
    s = (s * 6364136223846793005n + 1442695040888963407n) & MAX_HASH
    a.push(s)
    s = (s * 6364136223846793005n + 1442695040888963407n) & MAX_HASH
    b.push(s)
  }
  return { a, b }
}

const { a: PERM_A, b: PERM_B } = makeCoefficients(42)

function hashToken(token) {
  // FNV-1a 32-bit
  let h = 2166136261n
  for (let i = 0; i < token.length; i++) {
    h ^= BigInt(token.charCodeAt(i))
    h = (h * 16777619n) & MAX_HASH
  }
  return h
}

function minHash(text) {
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean)
  const shingles = new Set()
  for (let i = 0; i < tokens.length - 1; i++) {
    shingles.add(tokens[i] + ' ' + tokens[i + 1])
  }
  if (shingles.size === 0) return Buffer.alloc(NUM_PERMS * 4, 0xff)

  const sig = new Uint32Array(NUM_PERMS)
  sig.fill(0xffffffff)

  for (const shingle of shingles) {
    const h = hashToken(shingle)
    for (let i = 0; i < NUM_PERMS; i++) {
      const v = Number(((PERM_A[i] * h + PERM_B[i]) % MERSENNE_PRIME) & MAX_HASH)
      if (v < sig[i]) sig[i] = v
    }
  }

  return Buffer.from(sig.buffer)
}

// ── Stylometric features ───────────────────────────────────────────────────────

function extractStylometric(...texts) {
  const combined = texts.join(' ')
  const words = combined.split(/\s+/).filter(Boolean)
  const sentences = combined
    .replace(/[!?]/g, '.')
    .split('.')
    .map(s => s.trim())
    .filter(Boolean)

  const avgWordLen = words.length
    ? words.reduce((s, w) => s + w.length, 0) / words.length
    : 0

  const sentLens = sentences.map(s => s.split(/\s+/).filter(Boolean).length)
  const avgSentLen = sentLens.length ? sentLens.reduce((a, b) => a + b, 0) / sentLens.length : 0
  const sentLenStd = sentLens.length > 1
    ? Math.sqrt(sentLens.reduce((s, l) => s + (l - avgSentLen) ** 2, 0) / sentLens.length)
    : 0

  const uniqueWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-z]/g, '')))
  const vocabRichness = words.length ? uniqueWords.size / words.length : 0

  const punctCount = (combined.match(/[.,!?;:]/g) || []).length
  const punctDensity = combined.length ? punctCount / combined.length : 0

  const upperCount = (combined.match(/[A-Z]/g) || []).length
  const capsRatio = combined.length ? upperCount / combined.length : 0

  const ellipsisCount = (combined.match(/\.\.\./g) || []).length
  const emDashCount = (combined.match(/—/g) || []).length
  const exclamationCount = (combined.match(/!/g) || []).length
  const questionCount = (combined.match(/\?/g) || []).length

  return {
    avgWordLen:      +avgWordLen.toFixed(4),
    avgSentLen:      +avgSentLen.toFixed(4),
    sentLenStd:      +sentLenStd.toFixed(4),
    vocabRichness:   +vocabRichness.toFixed(4),
    punctDensity:    +punctDensity.toFixed(6),
    capsRatio:       +capsRatio.toFixed(6),
    ellipsisCount,
    emDashCount,
    exclamationCount,
    questionCount,
    totalWords:      words.length,
    totalChars:      combined.length,
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────

const worker = new Worker(
  process.env.CONTENT_ANALYSIS_QUEUE_KEY || 'contentAnalysis',
  async (job) => {
    const { userId, whyJoin, howFound, favoriteShows } = job.data

    console.log(`[content-analyzer] Processing survey for user ${userId}`)

    try {
      // Stylometric analysis across all three answers
      const stylometric = extractStylometric(whyJoin, howFound, favoriteShows)

      // MinHash on combined token set (for near-duplicate detection at signup)
      const combined = `${whyJoin} ${howFound} ${favoriteShows}`
      const minhashSig = minHash(combined)

      await prisma.surveyAnswers.update({
        where: { userId },
        data:  {
          stylometric,
          minhashSig,
          // Embeddings (whyJoinVec etc.) can be set here once
          // @xenova/transformers is confirmed installed on the server
        },
      })

      console.log(`[content-analyzer] Done for user ${userId}`)
    } catch (err) {
      console.error(`[content-analyzer] Failed for user ${userId}:`, err)
      throw err
    }
  },
  { connection }
)

worker.on('failed', (job, err) => {
  console.error(`[content-analyzer] Job ${job?.id} failed:`, err?.message)
})
