import { join } from 'path'
import { createReadStream, existsSync } from 'fs'
import { lookup } from 'mime-types'

export default defineEventHandler((event) => {
  const baseDir = process.env.BASE_UPLOAD_DIRECTORY
  const segments = event.context.params.path
  const filePath = join(baseDir, ...segments.split('/'))

  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: 'File not found' })
  }

  const mimeType = lookup(filePath) || 'application/octet-stream'
  setResponseHeader(event, 'Content-Type', mimeType)

  return sendStream(event, createReadStream(filePath))
})
