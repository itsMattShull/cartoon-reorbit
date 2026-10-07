// server/api/admin/global-config/logo.post.js
// Uploads the site-wide topbar logo (components/newsite/ReorbitLogo.vue), shown on every
// /newsite/* page. Mirrors second-edition-overlay.post.js: stored and served as-is (no sharp
// resize/re-encode), so an uploaded animated GIF stays animated — the logo renders into a
// fixed-size box with `object-fit: fill`, so unlike that overlay there's no natural-dimensions
// bookkeeping needed here.
import {
  defineEventHandler,
  readMultipartFormData,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const ALLOWED_TYPES = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
])
const MAX_BYTES = 3 * 1024 * 1024 // 3MB — this renders small (200x65), a logo never needs more

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  // 2) Parse multipart
  const parts = await readMultipartFormData(event)
  let imagePart = null
  for (const part of parts || []) {
    if (part.filename) imagePart = part
  }
  if (!imagePart) throw createError({ statusCode: 400, statusMessage: 'Image required.' })
  const ext = ALLOWED_TYPES.get(imagePart.type)
  if (!ext) throw createError({ statusCode: 400, statusMessage: 'PNG, JPEG, GIF, or WEBP only.' })
  if (!imagePart.data || imagePart.data.length > MAX_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Image must be 3MB or smaller.' })
  }

  // 3) Save with a server-generated filename — never trust the client filename/path
  const filename = `logo-${Date.now()}${ext}`
  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'global')
    : join(baseDir, 'public', 'global')

  await mkdir(uploadDir, { recursive: true })
  await writeFile(join(uploadDir, filename), imagePart.data)

  const assetPath = process.env.NODE_ENV === 'production'
    ? `/images/global/${filename}`
    : `/global/${filename}`

  // 4) Persist to the singleton global config row
  const before = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  const updated = await prisma.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', logoPath: assetPath },
    update: { logoPath: assetPath }
  })

  try {
    await logAdminChange(prisma, {
      userId: me.id,
      area: 'GlobalGameConfig',
      key: 'logoPath',
      prevValue: before?.logoPath ?? null,
      newValue: updated.logoPath
    })
  } catch {}

  return { logoPath: updated.logoPath }
})
