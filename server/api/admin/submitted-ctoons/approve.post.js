import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { mkdir, rename, access } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '@/server/prisma'
import { computeMultiHash, bucketFromHash } from '@/server/utils/multiHash'
import { readFile } from 'node:fs/promises'
import { sendDiscordDMByDiscordId } from '@/server/utils/discord'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

function getAbsolutePath(assetPath) {
  // Convert asset path back to filesystem path
  if (process.env.NODE_ENV === 'production') {
    // /images/submitted-ctoons/Series/file.png → cartoon-reorbit-images/submitted-ctoons/Series/file.png
    const relative = assetPath.replace(/^\/images\//, '')
    return join(baseDir, 'cartoon-reorbit-images', relative)
  } else {
    // /submitted-ctoons/Series/file.png → public/submitted-ctoons/Series/file.png
    return join(baseDir, 'public', assetPath)
  }
}

function getNewAssetPath(submission) {
  const series = submission.series
  const filename = basename(submission.assetPath)
  if (process.env.NODE_ENV === 'production') {
    return `/images/cToons/${series}/${filename}`
  } else {
    return `/cToons/${series}/${filename}`
  }
}

function getNewAbsolutePath(submission) {
  const series = submission.series
  const filename = basename(submission.assetPath)
  if (process.env.NODE_ENV === 'production') {
    return join(baseDir, 'cartoon-reorbit-images', 'cToons', series, filename)
  } else {
    return join(baseDir, 'public', 'cToons', series, filename)
  }
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const body = await readBody(event)
  const { ids } = body
  if (!Array.isArray(ids) || ids.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No submission IDs provided.' })
  }

  const submissions = await prisma.submittedCtoon.findMany({
    where: { id: { in: ids }, status: 'PENDING' },
    include: {
      user: { select: { id: true, discordId: true, username: true } }
    }
  })

  if (submissions.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'No pending submissions found.' })
  }

  const approvedCtoons = []
  const errors = []

  for (const submission of submissions) {
    try {
      // 1. Move image from submitted-ctoons to cToons folder
      const srcPath = getAbsolutePath(submission.assetPath)
      const destPath = getNewAbsolutePath(submission)
      const newAssetPath = getNewAssetPath(submission)

      // Ensure destination directory exists
      await mkdir(dirname(destPath), { recursive: true })

      // Check source file exists before moving
      await access(srcPath)
      await rename(srcPath, destPath)

      // 2. Compute image hashes from the moved file
      const imageBuffer = await readFile(destPath)
      const { phash, dhash } = await computeMultiHash(imageBuffer)
      const bucket = bucketFromHash(phash)

      // 3. Create real Ctoon record
      const ctoon = await prisma.ctoon.create({
        data: {
          name: submission.name,
          series: submission.series,
          set: submission.set,
          description: submission.description,
          type: submission.type,
          rarity: submission.rarity,
          assetPath: newAssetPath,
          releaseDate: submission.releaseDate,
          characters: submission.characters,
          quantity: submission.totalQuantity,
          initialQuantity: submission.initialQuantity,
          perUserLimit: submission.perUserLimit,
          inCmart: submission.inCmart,
          price: submission.price,
          imageHash: {
            create: { phash, dhash, bucket }
          }
        }
      })

      // 4. Mark submission as APPROVED
      await prisma.submittedCtoon.update({
        where: { id: submission.id },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          reviewedByUserId: me.id
        }
      })

      approvedCtoons.push({ submission, ctoon })
    } catch (err) {
      console.error(`Failed to approve submission ${submission.id}:`, err)
      errors.push({ id: submission.id, name: submission.name, error: err.message })
    }
  }

  // 5. Send Discord DMs grouped by user
  const byUser = new Map()
  for (const { submission } of approvedCtoons) {
    const uid = submission.user.id
    if (!byUser.has(uid)) byUser.set(uid, { user: submission.user, names: [] })
    byUser.get(uid).names.push(submission.name)
  }

  for (const { user, names } of byUser.values()) {
    if (!user.discordId) continue
    try {
      const nameList = names.map(n => `• ${n}`).join('\n')
      const msg = names.length === 1
        ? `🎉 Your submitted cToon **${names[0]}** has been **approved** and added to the collection!`
        : `🎉 The following cToons you submitted have been **approved** and added to the collection:\n${nameList}`
      await sendDiscordDMByDiscordId(user.discordId, msg)
    } catch {}
  }

  return {
    approved: approvedCtoons.length,
    errors
  }
})
