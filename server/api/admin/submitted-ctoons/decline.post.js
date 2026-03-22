import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '@/server/prisma'
import { sendDiscordDMByDiscordId } from '@/server/utils/discord'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..', '..')
  : process.cwd()

function getAbsolutePath(assetPath) {
  if (process.env.NODE_ENV === 'production') {
    const relative = assetPath.replace(/^\/images\//, '')
    return join(baseDir, 'cartoon-reorbit-images', relative)
  } else {
    return join(baseDir, 'public', assetPath)
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

  const declinedNames = []
  const byUser = new Map()

  for (const submission of submissions) {
    // Delete the image file
    try {
      const filePath = getAbsolutePath(submission.assetPath)
      await unlink(filePath)
    } catch {}

    // Mark as DECLINED
    await prisma.submittedCtoon.update({
      where: { id: submission.id },
      data: {
        status: 'DECLINED',
        reviewedAt: new Date(),
        reviewedByUserId: me.id
      }
    })

    declinedNames.push(submission.name)

    const uid = submission.user.id
    if (!byUser.has(uid)) byUser.set(uid, { user: submission.user, names: [] })
    byUser.get(uid).names.push(submission.name)
  }

  // Send Discord DMs grouped by user
  for (const { user, names } of byUser.values()) {
    if (!user.discordId) continue
    try {
      const nameList = names.map(n => `• ${n}`).join('\n')
      const msg = names.length === 1
        ? `❌ Your submitted cToon **${names[0]}** has been **declined** and will not be added to the collection.`
        : `❌ The following cToons you submitted have been **declined** and will not be added to the collection:\n${nameList}`
      await sendDiscordDMByDiscordId(user.discordId, msg)
    } catch {}
  }

  return { declined: submissions.length }
})
