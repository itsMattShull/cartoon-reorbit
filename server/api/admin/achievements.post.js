// server/api/admin/achievements.post.js
import { defineEventHandler, getRequestHeader, readMultipartFormData, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseRewardBundle, validateRewardBundleRefs } from '@/server/utils/achievementRewardBundle'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/gif']
const MAX_CLAIM_OPTIONS = 4

function sanitize(name = '') { return name.replace(/[^A-Za-z0-9._-]/g, '') }
function slugify(s = '') { return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'achievement' }

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const parts = await readMultipartFormData(event)
  if (!parts) throw createError({ statusCode: 400, statusMessage: 'multipart/form-data expected' })

  let filePart = null
  let payload = {}
  for (const part of parts) {
    if (part.filename) filePart = part
    else if (part.name === 'payload') {
      try { payload = JSON.parse(Buffer.isBuffer(part.data) ? part.data.toString('utf-8') : String(part.data)) } catch {}
    }
  }

  const {
    title = '',
    slug: desiredSlug,
    description = null,
    isActive = true,
    notifyDiscord = false,
    discordRoleName = '',
    isClaimable = false,
    cMoonRankId: rawCMoonRankId = null,
    criteria = {},
    rewards = {},
    claimOptions = []
  } = payload || {}

  if (!String(title).trim()) throw createError({ statusCode: 400, statusMessage: 'Title is required' })

  const cMoonPointsGte = criteria?.cMoonPointsGte != null && criteria.cMoonPointsGte !== ''
    ? Math.max(0, Number(criteria.cMoonPointsGte)) : null
  const cMoonRankId = typeof rawCMoonRankId === 'string' && rawCMoonRankId ? rawCMoonRankId : null

  // cMoonPointsGte only makes sense paired with the rank it unlocks (it implicitly scopes
  // the achievement to that rank's cMoon — see evaluateUserAgainstAchievement), and a
  // rank-up always auto-grants, so it can never also be a claim-your-prize achievement.
  if ((cMoonPointsGte != null) !== (cMoonRankId != null)) {
    throw createError({ statusCode: 400, statusMessage: 'A cMoon rank achievement needs both a points threshold and a rank selected' })
  }
  if (cMoonRankId && isClaimable) {
    throw createError({ statusCode: 400, statusMessage: 'A cMoon-rank achievement cannot also be claimable' })
  }
  if (cMoonRankId) {
    const rankExists = await db.cMoonRank.count({ where: { id: cMoonRankId } })
    if (!rankExists) throw createError({ statusCode: 400, statusMessage: 'Selected cMoon rank does not exist' })
  }

  const rewardBundle = parseRewardBundle(rewards)
  const claimOptionRows = (Array.isArray(claimOptions) ? claimOptions : [])
    .slice(0, MAX_CLAIM_OPTIONS)
    .filter(o => o && String(o.label || '').trim())
    .map((o, i) => ({ label: String(o.label).trim(), sortOrder: i, ...parseRewardBundle(o) }))

  await validateRewardBundleRefs(db, isClaimable ? claimOptionRows : [rewardBundle])

  let slug = slugify(desiredSlug || title)

  // ensure unique slug
  let suffix = 1
  while (await db.achievement.findUnique({ where: { slug } })) {
    slug = `${slugify(title)}-${suffix++}`
  }

  // Optional image
  let imagePath = null
  if (filePart) {
    if (!ALLOWED_MIMES.includes(filePart.type)) throw createError({ statusCode: 400, statusMessage: 'Only PNG/GIF/JPEG allowed' })

    const uploadDir = process.env.NODE_ENV === 'production'
      ? join(baseDir, 'cartoon-reorbit-images', 'achievements')
      : join(baseDir, 'public', 'achievements')
    await mkdir(uploadDir, { recursive: true })
    const filename = `${Date.now()}_${sanitize(filePart.filename)}`
    await writeFile(join(uploadDir, filename), filePart.data)
    imagePath = process.env.NODE_ENV === 'production' ? `/images/achievements/${filename}` : `/achievements/${filename}`
  }

  const roleName = typeof discordRoleName === 'string' ? discordRoleName.trim() : ''
  // Generated up front (not left to the DB default) so claim-option reward rows below can
  // reference this achievement's id — AchievementReward relates back to Achievement directly,
  // not through AchievementClaimOption, so Prisma's nested-write inference can't wire that up
  // for us in one call.
  const achievementId = randomUUID()

  await db.$transaction(async (tx) => {
    await tx.achievement.create({
      data: {
        id: achievementId,
        slug,
        title: String(title),
        description: description ? String(description) : null,
        imagePath,
        isActive: !!isActive,
        notifyDiscord: !!notifyDiscord,
        discordRoleName: roleName || null,
        isClaimable: !!isClaimable,
        cMoonPointsGte,
        cMoonRankId,
        pointsGte:       criteria?.pointsGte       ?? null,
        totalCtoonsGte:  criteria?.totalCtoonsGte  ?? null,
        uniqueCtoonsGte: criteria?.uniqueCtoonsGte ?? null,
        auctionsWonGte:  criteria?.auctionsWonGte  ?? null,
        auctionsCreatedGte: criteria?.auctionsCreatedGte ?? null,
        tradesAcceptedGte: criteria?.tradesAcceptedGte ?? null,
        ctoonSuggestionsAcceptedGte: criteria?.ctoonSuggestionsAcceptedGte ?? null,
        cumulativeActiveDaysGte: criteria?.cumulativeActiveDaysGte ?? null,
        tkoWinsGte: criteria?.tkoWinsGte ?? null,
        wordleWinsGte: criteria?.wordleWinsGte ?? null,
        wordleCurrentStreakGte: criteria?.wordleCurrentStreakGte ?? null,
        flappyBestScoreGte: criteria?.flappyBestScoreGte ?? null,
        setsRequired: Array.isArray(criteria?.setsRequired) ? criteria.setsRequired.filter(Boolean) : [],
        userCreatedBefore: criteria?.userCreatedBefore ? new Date(criteria.userCreatedBefore) : null,
        requiredCtoons: {
          create: (Array.isArray(criteria?.ctoonsRequired) ? criteria.ctoonsRequired : [])
            .filter(r => r?.ctoonId)
            .map(r => ({ ctoonId: String(r.ctoonId) }))
        },
      }
    })

    if (!isClaimable) {
      await tx.achievementReward.create({
        data: {
          achievementId,
          points: rewardBundle.points,
          ctoons: { create: rewardBundle.ctoons },
          backgrounds: { create: rewardBundle.backgrounds },
        }
      })
    } else {
      for (const opt of claimOptionRows) {
        const reward = await tx.achievementReward.create({
          data: {
            achievementId,
            points: opt.points,
            ctoons: { create: opt.ctoons },
            backgrounds: { create: opt.backgrounds },
          }
        })
        await tx.achievementClaimOption.create({
          data: { achievementId, label: opt.label, sortOrder: opt.sortOrder, rewardId: reward.id }
        })
      }
    }
  })

  await logAdminChange(db, { userId: me.id, area: 'Achievements', key: `create:${slug}`, prevValue: null, newValue: { id: achievementId, slug } })

  return { id: achievementId }
})
