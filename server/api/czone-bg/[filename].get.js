import { defineEventHandler, createError, setResponseHeader } from 'h3'
import { join, extname } from 'node:path'
import { readFile } from 'node:fs/promises'

const MIME_MAP = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
}

function bgDir() {
  return process.env.BASE_UPLOAD_DIRECTORY
    ? join(process.env.BASE_UPLOAD_DIRECTORY, 'backgrounds')
    : join(process.cwd(), 'public', 'backgrounds')
}

export default defineEventHandler(async (event) => {
  const filename = event.context.params?.filename
  if (!filename || filename.includes('..') || filename.includes('/')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid filename' })
  }

  const filePath = join(bgDir(), filename)
  let data
  try {
    data = await readFile(filePath)
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Background not found' })
  }

  const ext  = extname(filename).toLowerCase()
  const mime = MIME_MAP[ext] || 'application/octet-stream'
  setResponseHeader(event, 'Content-Type', mime)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  return data
})
