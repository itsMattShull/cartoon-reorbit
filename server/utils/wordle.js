// server/utils/wordle.js
import { prisma } from '../prisma.js'

const DISCORD_API = 'https://discord.com/api/v10'
const WORDLE_CHANNEL_ID = '1507017307837305023'
const WORDLE_APP_ID = '1211781489931452447'

// Regex to extract Discord user ID mentions: <@123456789>
const MENTION_RE = /<@(\d+)>/g

// Regex to match a score line: optional 👑, then e.g. "3/6:"
const SCORE_LINE_RE = /^(👑\s*)?(\d+\/\d+|X\/\d+):/

function utcMidnight(date) {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function parseMentions(text) {
  const ids = []
  let m
  const re = new RegExp(MENTION_RE.source, 'g')
  while ((m = re.exec(text)) !== null) ids.push(m[1])
  return ids
}

function parseWordleMessage(message) {
  // Returns array of { discordId, isWinner, score } or null if not a Wordle result post
  const text = message.content || ''
  if (!text.includes("yesterday's results") && !text.includes("Here are")) return null

  const lines = text.split('\n')
  const results = []

  for (const line of lines) {
    const match = SCORE_LINE_RE.exec(line.trim())
    if (!match) continue
    const isCrown = Boolean(match[1])
    const score = match[2]
    const ids = parseMentions(line)
    for (const discordId of ids) {
      results.push({ discordId, isWinner: isCrown, score })
    }
  }

  return results.length > 0 ? results : null
}

function puzzleDateFromMessage(message) {
  // Message says "yesterday's results" — puzzle date is the calendar day before the post
  const posted = new Date(message.timestamp)
  const puzzleDate = new Date(posted)
  puzzleDate.setUTCDate(puzzleDate.getUTCDate() - 1)
  return utcMidnight(puzzleDate)
}

export async function syncWordleResults() {
  const botToken = process.env.BOT_TOKEN
  if (!botToken) {
    console.error('[wordle] BOT_TOKEN not set — skipping Wordle sync')
    return
  }

  const authHeader = botToken.startsWith('Bot ') ? botToken : `Bot ${botToken}`

  let messages
  try {
    const res = await fetch(`${DISCORD_API}/channels/${WORDLE_CHANNEL_ID}/messages?limit=20`, {
      headers: { Authorization: authHeader }
    })
    if (!res.ok) {
      console.error('[wordle] Failed to fetch Discord messages:', res.status, await res.text())
      return
    }
    messages = await res.json()
  } catch (err) {
    console.error('[wordle] Error fetching Discord messages:', err?.message)
    return
  }

  if (!Array.isArray(messages)) {
    console.error('[wordle] Unexpected response from Discord:', messages)
    return
  }

  // Filter to messages from the Wordle app
  const wordleMessages = messages.filter(
    m => m.application_id === WORDLE_APP_ID || m.author?.id === WORDLE_APP_ID
  )

  if (wordleMessages.length === 0) {
    console.log('[wordle] No Wordle bot messages found in recent history')
    return
  }

  let totalUpserted = 0

  for (const message of wordleMessages) {
    const parsed = parseWordleMessage(message)
    if (!parsed) continue

    const puzzleDate = puzzleDateFromMessage(message)

    // Resolve all Discord IDs to user IDs in one query
    const discordIds = [...new Set(parsed.map(r => r.discordId))]
    const users = await prisma.user.findMany({
      where: { discordId: { in: discordIds }, active: true, banned: false },
      select: { id: true, discordId: true }
    })
    const discordToUserId = new Map(users.map(u => [u.discordId, u.id]))

    for (const { discordId, isWinner, score } of parsed) {
      const userId = discordToUserId.get(discordId)
      if (!userId) continue

      try {
        await prisma.wordleResult.upsert({
          where: { userId_date: { userId, date: puzzleDate } },
          update: { isWinner, score },
          create: { userId, date: puzzleDate, isWinner, score }
        })
        totalUpserted++
      } catch (err) {
        console.error('[wordle] Error upserting WordleResult:', err?.message)
      }
    }
  }

  console.log(`[wordle] Synced ${totalUpserted} Wordle results`)
}

export async function getWordleWinCount(db, userId) {
  const client = db || prisma
  return client.wordleResult.count({ where: { userId, isWinner: true } })
}

export async function getWordleCurrentStreak(db, userId) {
  const client = db || prisma

  // All dates with any results (most recent first) — used as the spine of days to check
  const allDates = await client.wordleResult.findMany({
    distinct: ['date'],
    orderBy: { date: 'desc' },
    select: { date: true }
  })

  if (allDates.length === 0) return 0

  // Dates this user won
  const userWins = await client.wordleResult.findMany({
    where: { userId, isWinner: true },
    select: { date: true }
  })
  const wonSet = new Set(userWins.map(r => r.date.toISOString().split('T')[0]))

  let streak = 0
  for (const { date } of allDates) {
    const dateStr = date.toISOString().split('T')[0]
    if (wonSet.has(dateStr)) {
      streak++
    } else {
      break
    }
  }

  return streak
}
