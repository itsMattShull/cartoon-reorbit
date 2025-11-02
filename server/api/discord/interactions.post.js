// server/api/discord/interactions.post.js
import { defineEventHandler, getRequestHeader, createError, readRawBody } from 'h3'
import nacl from 'tweetnacl'

const hex2bin = (hex) => Uint8Array.from(Buffer.from(hex, 'hex'))

export default defineEventHandler(async (event) => {
  const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY
  if (!PUBLIC_KEY) throw createError({ statusCode: 500, statusMessage: 'Missing DISCORD_PUBLIC_KEY' })

  // — Verify signature
  const signature = getRequestHeader(event, 'x-signature-ed25519') || ''
  const timestamp = getRequestHeader(event, 'x-signature-timestamp') || ''
  const bodyRaw = await readRawBody(event, 'utf8')
  const ok = nacl.sign.detached.verify(
    Buffer.from(timestamp + bodyRaw),
    hex2bin(signature),
    hex2bin(PUBLIC_KEY)
  )
  if (!ok) throw createError({ statusCode: 401, statusMessage: 'Bad signature' })

  const interaction = JSON.parse(bodyRaw)

  // — PING
  if (interaction.type === 1) return { type: 1 }

  // — Slash command
  if (interaction.type === 2 && interaction.data?.name === 'czone') {
    // USER option is required
    const option = interaction.data.options?.find(o => o.name === 'user')
    const userId = option?.value
    const resolvedUser = interaction.data.resolved?.users?.[userId]
    if (!resolvedUser) {
      return {
        type: 4,
        data: { content: 'User not found.', flags: 64 } // ephemeral
      }
    }

    // Use the user’s username (Discord handle). Lowercase for URL safety.
    const handle = String(resolvedUser.username || '').trim().toLowerCase()

    // Basic guard for unexpected characters
    const safeHandle = handle.replace(/[^a-z0-9._-]/g, '')

    const link = `https://www.cartoonreorbit.com/czone/${safeHandle}`

    return {
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        content: link,
        flags: 64 // ephemeral reply so you don’t spam channels
      }
    }
  }

  // — Not handled
  return { type: 4, data: { content: 'Unsupported interaction.', flags: 64 } }
})
