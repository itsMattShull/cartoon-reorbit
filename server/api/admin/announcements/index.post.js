import {
  defineEventHandler,
  readMultipartFormData,
  getRequestHeader,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma as db } from '@/server/prisma'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const ALLOWED_TYPES = new Set(['image/png','image/jpeg','image/jpg','image/gif'])

function parseLocalYmdHm(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(s)
  if (!m) return null
  return { y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5] }
}

function centralLocalToUTC(localYmdHm) {
  const parts = parseLocalYmdHm(localYmdHm)
  if (!parts) return null

  const { y, m, d, h, mi } = parts
  const utcGuessMs = Date.UTC(y, m - 1, d, h, mi, 0)

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
  const displayed = Object.fromEntries(
    fmt.formatToParts(new Date(utcGuessMs))
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value])
  )
  const zonalMs = Date.UTC(
    Number(displayed.year),
    Number(displayed.month) - 1,
    Number(displayed.day),
    Number(displayed.hour),
    Number(displayed.minute),
    Number(displayed.second)
  )

  const offsetMs = zonalMs - utcGuessMs
  return new Date(utcGuessMs - offsetMs)
}

function publicAssetPath(filename) {
  return process.env.NODE_ENV === 'production'
    ? `/images/announcements/${filename}`
    : `/announcements/${filename}`
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'Missing form data' })

  let filePart = null
  const fields = {}
  for (const part of parts) {
    if (part.filename) filePart = part
    else fields[part.name] = Buffer.isBuffer(part.data) ? part.data.toString('utf-8') : String(part.data ?? '')
  }

  const message = String(fields.message || '').trim()
  if (!message) throw createError({ statusCode: 400, statusMessage: 'Message is required' })
  if (message.length > 280) throw createError({ statusCode: 400, statusMessage: 'Message must be 280 characters or less' })

  const scheduledAtLocal = String(fields.scheduledAtLocal || '').trim()
  if (!scheduledAtLocal) throw createError({ statusCode: 400, statusMessage: 'Scheduled time is required' })
  const scheduledAt = centralLocalToUTC(scheduledAtLocal)
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'scheduledAtLocal must be "YYYY-MM-DD HH:mm"' })
  }
  if (scheduledAt.getTime() <= Date.now()) {
    throw createError({ statusCode: 400, statusMessage: 'Scheduled time must be in the future' })
  }

  const pingRaw = String(fields.pingOption || '').trim()
  if (pingRaw && !['@everyone','@here'].includes(pingRaw)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid ping option' })
  }
  const pingOption = pingRaw || null

  let imagePath = null
  let imageFilename = null
  if (filePart) {
    if (!ALLOWED_TYPES.has(filePart.type)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid file type ${filePart.type}` })
    }
    const uploadDir = process.env.NODE_ENV === 'production'
      ? join(baseDir, 'cartoon-reorbit-images', 'announcements')
      : join(baseDir, 'public', 'announcements')
    await mkdir(uploadDir, { recursive: true })

    const ext = extname(filePart.filename || '').toLowerCase() ||
      (filePart.type === 'image/png' ? '.png' : filePart.type === 'image/gif' ? '.gif' : '.jpg')
    imageFilename = `announcement-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
    await writeFile(join(uploadDir, imageFilename), filePart.data)
    imagePath = publicAssetPath(imageFilename)
  }

  const row = await db.announcement.create({
    data: {
      message,
      pingOption,
      imagePath,
      imageFilename,
      scheduledAt,
      createdById: me.id || null
    },
    select: {
      id: true,
      message: true,
      pingOption: true,
      imagePath: true,
      scheduledAt: true,
      createdAt: true
    }
  })

  return { ok: true, item: row }
})
