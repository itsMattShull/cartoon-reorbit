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
    const resolvedMember = interaction.data.resolved?.members?.[userId]  // has .nick in guilds

    if (!resolvedUser) {
      return { type: 4, data: { content: 'User not found.', flags: 64 } }
    }

    // 1) pick display in order: guild nickname → global display name → username
    let display =
      resolvedMember?.nick ||
      resolvedUser.global_name ||
      resolvedUser.username || ''

    // 2) make URL-safe: strip diacritics, lowercase, allow [a-z0-9._-], turn spaces to -
    display = display
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
      .trim()
      .replace(/\s+/g, '-')                             // spaces → dashes
      .replace(/[^A-Za-z0-9._-]/g, '')                  // allow case-preserving set

    if (!display) {
      return { type: 4, data: { content: 'Name is empty after sanitizing.', flags: 64 } }
    }

    const link = `https://www.cartoonreorbit.com/czone/${display}`

    return {
      type: 4,
      data: { content: link, flags: 64 }
    }
  }

  // — Not handled
  return { type: 4, data: { content: 'Unsupported interaction.', flags: 64 } }
})
