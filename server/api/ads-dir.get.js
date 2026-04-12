import { join } from 'path'
import { readdirSync, existsSync } from 'fs'

const IMAGE_EXTS = new Set(['.gif', '.png', '.jpg', '.jpeg', '.webp'])

export default defineEventHandler(() => {
  const base = process.env.BASE_UPLOAD_DIRECTORY
  if (!base) return { files: [] }

  const dir = join(base, 'ads')
  if (!existsSync(dir)) return { files: [] }

  const files = readdirSync(dir)
    .filter(f => IMAGE_EXTS.has(f.slice(f.lastIndexOf('.')).toLowerCase()))
    .sort()

  return { files }
})
