// POST /api/czone-contest/[id]/submit — submit a zone snapshot to the contest
import { defineEventHandler, getRequestHeader, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '@/server/prisma'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..', '..')
  : process.cwd()

export default defineEventHandler(async (event) => {
  const { id } = event.context.params

  // Auth check
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me = null
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {}
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // Verify contest exists and is active
  const now = new Date()
  const contest = await prisma.cZoneContest.findUnique({
    where: { id },
    select: { id: true, startDate: true, endDate: true, distributedAt: true }
  })
  if (!contest) throw createError({ statusCode: 404, statusMessage: 'Contest not found' })
  if (contest.distributedAt) throw createError({ statusCode: 400, statusMessage: 'Contest has already ended' })
  if (now < contest.startDate || now > contest.endDate) throw createError({ statusCode: 400, statusMessage: 'Contest is not active' })

  // Check for existing submission
  const existing = await prisma.cZoneContestSubmission.findUnique({
    where: { contestId_userId: { contestId: id, userId: me.id } }
  })
  if (existing) throw createError({ statusCode: 400, statusMessage: 'You have already submitted to this contest' })

  // Parse multipart
  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  let filePart = null
  let zoneIndex = 0

  for (const p of parts) {
    if (p.filename || (p.name === 'image' && p.data)) {
      filePart = p
    } else if (p.name === 'zoneIndex') {
      zoneIndex = parseInt(p.data?.toString() || '0', 10)
    }
  }

  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Missing image' })
  if (!['image/png', 'image/jpeg', 'image/jpg'].includes(filePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG or JPEG images allowed' })
  }

  // Save image
  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'czone-contests')
    : join(baseDir, 'public', 'czone-contests')

  await mkdir(uploadDir, { recursive: true })

  const safeExt = extname(filePart.filename || '').toLowerCase() || '.png'
  const filename = `${me.id}-${id}-${Date.now()}${safeExt}`
  await writeFile(join(uploadDir, filename), filePart.data)

  const imageUrl = process.env.NODE_ENV === 'production'
    ? `/images/czone-contests/${filename}`
    : `/czone-contests/${filename}`

  // Create submission record
  const submission = await prisma.cZoneContestSubmission.create({
    data: { contestId: id, userId: me.id, zoneIndex, imageUrl }
  })

  return { id: submission.id, imageUrl }
})
