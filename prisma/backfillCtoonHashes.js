import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { prisma } from '../server/prisma.js'
import { computeMultiHash, bucketFromHash } from '../server/utils/multiHash.js'

const baseDir = process.cwd()
const pageSize = Number(process.env.PAGE_SIZE || 100)
const limit = Number(process.env.LIMIT || 0)
const onlyMissing = String(process.env.ONLY_MISSING || 'true') !== 'false'
const dryRun = String(process.env.DRY_RUN || 'false') === 'true'

async function resolveLocalAssetPath(assetPath) {
  if (!assetPath || typeof assetPath !== 'string') return null
  if (assetPath.startsWith('http://') || assetPath.startsWith('https://')) return null

  const trimmed = assetPath.replace(/^\//, '')
  const candidates = [
    join(baseDir, 'public', trimmed)
  ]

  if (assetPath.startsWith('/images/cToons/')) {
    const rel = assetPath.replace(/^\/images\/cToons\//, '')
    candidates.push(join(baseDir, 'cartoon-reorbit-images', 'cToons', rel))
  }

  if (assetPath.startsWith('/cToons/')) {
    const rel = assetPath.replace(/^\/cToons\//, '')
    candidates.push(join(baseDir, 'cartoon-reorbit-images', 'cToons', rel))
  }

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {}
  }

  return null
}

async function main() {
  let cursor = null
  let processed = 0
  let created = 0
  let skippedExisting = 0
  let skippedMissing = 0
  let skippedRemote = 0
  let failures = 0

  while (true) {
    const batch = await prisma.ctoon.findMany({
      take: pageSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        assetPath: true,
        imageHash: { select: { id: true } }
      }
    })

    if (batch.length === 0) break

    for (const row of batch) {
      cursor = row.id

      if (onlyMissing && row.imageHash) {
        skippedExisting += 1
        continue
      }

      if (row.assetPath?.startsWith('http://') || row.assetPath?.startsWith('https://')) {
        skippedRemote += 1
        continue
      }

      const localPath = await resolveLocalAssetPath(row.assetPath)
      if (!localPath) {
        skippedMissing += 1
        console.warn(`Missing file for ${row.name} (${row.id}): ${row.assetPath}`)
        continue
      }

      try {
        const buffer = await readFile(localPath)
        const { phash, dhash } = await computeMultiHash(buffer)
        const bucket = bucketFromHash(phash)
        const data = { ctoonId: row.id, phash, dhash, bucket }

        if (!dryRun) {
          await prisma.ctoonImageHash.upsert({
            where: { ctoonId: row.id },
            create: data,
            update: { phash, dhash, bucket }
          })
        }

        created += 1
        processed += 1
        if (limit > 0 && processed >= limit) break
      } catch (err) {
        failures += 1
        console.warn(`Failed to hash ${row.name} (${row.id}): ${err?.message || err}`)
      }
    }

    if (limit > 0 && processed >= limit) break
  }

  console.log('Hash backfill complete.')
  console.log(`Created/updated: ${created}`)
  console.log(`Skipped existing: ${skippedExisting}`)
  console.log(`Missing files: ${skippedMissing}`)
  console.log(`Skipped remote: ${skippedRemote}`)
  console.log(`Failures: ${failures}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
