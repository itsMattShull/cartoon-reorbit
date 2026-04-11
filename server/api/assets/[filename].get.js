import { defineEventHandler, createError, setResponseHeader } from 'h3'
import { join, extname } from 'path'
import { readFile } from 'fs/promises'

const MIME_MAP = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
}

function assetsDir() {
  return process.env.BASE_UPLOAD_DIRECTORY
    ? join(process.env.BASE_UPLOAD_DIRECTORY, 'assets')
    : join(process.cwd(), 'public', 'assets')
}

export default defineEventHandler(async (event) => {
  const { filename } = event.context.params || {}
  if (!filename || filename.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid filename' })
  }

  const filePath = join(assetsDir(), filename)
  let data
  try {
    data = await readFile(filePath)
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  }

  const mime = MIME_MAP[extname(filename).toLowerCase()] ?? 'application/octet-stream'
  setResponseHeader(event, 'Content-Type', mime)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=86400')
  return data
})
