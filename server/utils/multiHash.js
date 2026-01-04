import sharp from 'sharp'
import imghash from 'imghash'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HASH_BITS = 8
const HASH_HEX_LENGTH = 16
const HASH_BIT_LENGTH = 64
const HEX_POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]
export const DEFAULT_DUP_THRESHOLDS = { phash: 14, dhash: 16 }
const HASH_FN = typeof imghash === 'function'
  ? imghash
  : imghash?.hash || imghash?.default?.hash

export async function computeMultiHash(buffer) {
  const normalized = await normalizeImageBuffer(buffer)
  const [phash, dhash] = await Promise.all([
    computePhash(normalized),
    computeDhash(normalized)
  ])
  return { phash, dhash }
}

export function hammingDistanceHex(a, b) {
  const hashA = normalizeHash(a)
  const hashB = normalizeHash(b)
  let distance = 0
  for (let i = 0; i < hashA.length; i++) {
    const aNibble = parseInt(hashA[i], 16)
    const bNibble = parseInt(hashB[i], 16)
    distance += HEX_POPCOUNT[aNibble ^ bNibble]
  }
  return distance
}

export function bucketFromHash(hash, prefixLen = 4) {
  return normalizeHash(hash).slice(0, prefixLen)
}

export function findNearDuplicate(incoming, candidates, thresholds = DEFAULT_DUP_THRESHOLDS) {
  if (!incoming?.phash || !incoming?.dhash) return null
  const resolvedThresholds = normalizeDuplicateThresholds(thresholds)
  let best = null

  for (const candidate of candidates || []) {
    if (!candidate?.phash || !candidate?.dhash) continue
    const phashDist = hammingDistanceHex(incoming.phash, candidate.phash)
    const dhashDist = hammingDistanceHex(incoming.dhash, candidate.dhash)
    const isDuplicate = phashDist <= resolvedThresholds.phash || dhashDist <= resolvedThresholds.dhash
    if (!isDuplicate) continue

    const score = Math.min(phashDist, dhashDist)
    const tieBreaker = phashDist + dhashDist
    if (!best || score < best.score || (score === best.score && tieBreaker < best.tieBreaker)) {
      best = {
        ctoonId: candidate.ctoonId,
        ctoon: candidate.ctoon || null,
        phashDist,
        dhashDist,
        score,
        tieBreaker
      }
    }
  }

  if (!best) return null
  const { score, tieBreaker, ...match } = best
  return match
}

export function normalizeDuplicateThresholds(input, fallback = DEFAULT_DUP_THRESHOLDS) {
  const phash = clampThreshold(input?.phash, fallback.phash)
  const dhash = clampThreshold(input?.dhash, fallback.dhash)
  return { phash, dhash }
}

async function normalizeImageBuffer(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 90 })
    .toBuffer()
}

async function computePhash(buffer) {
  try {
    const result = await hashWithImghash(buffer)
    return normalizeHash(result)
  } catch {
    try {
      const tmpDir = await mkdtemp(join(tmpdir(), 'ctoon-hash-'))
      const tmpPath = join(tmpDir, 'image.jpg')
      await writeFile(tmpPath, buffer)
      try {
        const result = await hashWithImghash(tmpPath)
        return normalizeHash(result)
      } finally {
        await rm(tmpDir, { recursive: true, force: true })
      }
    } catch {
      const fallback = await computePhashFallback(buffer)
      return normalizeHash(fallback)
    }
  }
}

async function hashWithImghash(input) {
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (err, hash) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(hash)
    }

    try {
      if (!HASH_FN) {
        throw new Error('imghash hash function not available')
      }
      const result = HASH_FN(input, HASH_BITS, 'hex', done)
      if (result && typeof result.then === 'function') {
        result.then((hash) => done(null, hash)).catch(done)
      } else if (typeof result === 'string') {
        done(null, result)
      }
    } catch (err) {
      done(err)
    }
  })
}

async function computePhashFallback(buffer) {
  const size = 32
  const smallerSize = 8
  const { data } = await sharp(buffer)
    .grayscale()
    .resize(size, size, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const cosTable = new Array(size)
  for (let i = 0; i < size; i++) {
    cosTable[i] = new Array(size)
    for (let j = 0; j < size; j++) {
      cosTable[i][j] = Math.cos(((2 * i + 1) * j * Math.PI) / (2 * size))
    }
  }

  const coeffs = []
  for (let u = 0; u < smallerSize; u++) {
    const cu = u === 0 ? Math.SQRT1_2 : 1
    for (let v = 0; v < smallerSize; v++) {
      const cv = v === 0 ? Math.SQRT1_2 : 1
      let sum = 0
      for (let x = 0; x < size; x++) {
        const rowOffset = x * size
        const cosX = cosTable[x][u]
        for (let y = 0; y < size; y++) {
          sum += data[rowOffset + y] * cosX * cosTable[y][v]
        }
      }
      coeffs.push(0.25 * cu * cv * sum)
    }
  }

  const medianSource = coeffs.slice(1)
  const median = medianSource
    .slice()
    .sort((a, b) => a - b)[Math.floor(medianSource.length / 2)]

  const bits = coeffs.map((coeff) => (coeff > median ? 1 : 0))
  return bitsToHex(bits)
}

async function computeDhash(buffer) {
  const width = 9
  const height = 8
  const { data } = await sharp(buffer)
    .grayscale()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const bits = []
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width
    for (let x = 0; x < width - 1; x++) {
      const left = data[rowOffset + x]
      const right = data[rowOffset + x + 1]
      bits.push(left > right ? 1 : 0)
    }
  }
  return bitsToHex(bits)
}

function normalizeHash(hash) {
  const normalized = String(hash || '').trim().toLowerCase()
  return normalized.padStart(HASH_HEX_LENGTH, '0').slice(-HASH_HEX_LENGTH)
}

function bitsToHex(bits) {
  const normalized = Array.from(bits || []).slice(0, HASH_BIT_LENGTH)
  while (normalized.length < HASH_BIT_LENGTH) normalized.push(0)

  let hex = ''
  for (let i = 0; i < HASH_BIT_LENGTH; i += 4) {
    const nibble = (normalized[i] << 3)
      | (normalized[i + 1] << 2)
      | (normalized[i + 2] << 1)
      | normalized[i + 3]
    hex += nibble.toString(16)
  }
  return hex.padStart(HASH_HEX_LENGTH, '0')
}

function clampThreshold(value, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(64, Math.max(0, Math.round(num)))
}
