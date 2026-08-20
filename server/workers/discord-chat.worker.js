// Discord chat relay — gateway process. Run by PM2 as `discord-chat`
// (ecosystem.config.cjs), or `npm run discord-chat`.
//
// Separate from socket-server because: (1) socket-server has no
// uncaughtException handler and doesn't persist live Clash matches on a
// crash, so gateway code must not be able to take it down; (2) it runs a
// 60Hz physics loop that must not compete with a gateway heartbeat; (3)
// `pm2 reload socket-server` would otherwise drop the gateway. instances:1
// also guarantees a single connection with no distributed lock needed.

import dotenv from 'dotenv'
dotenv.config()

import { prisma } from '../prisma.js'
import { getRedis } from '../utils/redis.js'
import { CHAT_CHANNELS } from '../utils/discordChat/constants.js'
import { loadChatConfig, rawBotToken, webhookCredentials } from '../utils/discordChat/config.js'
import { DiscordChatGateway } from '../utils/discordChat/gateway.js'

const redis = getRedis()
const subscriber = redis.duplicate() // subscriber mode can't serve ordinary commands

// A crash still costs an IDENTIFY on restart, so log and keep running
// rather than let Node 22 treat an unhandled rejection as fatal.
process.on('unhandledRejection', (err) => console.error('[DiscordChat] unhandled rejection:', err))
process.on('uncaughtException', (err) => console.error('[DiscordChat] uncaught exception:', err))

const gateway = new DiscordChatGateway({
  redis,
  prisma,
  loadConfig: () => loadChatConfig(redis, prisma),
  rawToken: rawBotToken(),
  guildId: process.env.DISCORD_GUILD_ID,
  webhookId: webhookCredentials()?.id ?? null
})

async function main() {
  const config = await loadChatConfig(redis, prisma)
  if (!config.discordChatEnabled) console.log('[DiscordChat] relay is disabled; idling until an admin enables it.')

  await subscriber.subscribe(CHAT_CHANNELS.configChanged)
  subscriber.on('message', (channel) => {
    if (channel !== CHAT_CHANNELS.configChanged) return
    gateway.onConfigChanged().catch((err) => console.error('[DiscordChat] config reload failed:', err?.message || err))
  })

  await gateway.start()
  if (process.send) process.send('ready')
}

async function shutdown(signal) {
  console.log(`[DiscordChat] ${signal} received, closing gateway`)
  try { await gateway.stop() } catch (err) { console.error('[DiscordChat] shutdown error:', err?.message || err) }
  try { await prisma.$disconnect() } catch {}
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

main().catch((err) => {
  console.error('[DiscordChat] failed to start:', err)
  process.exit(1)
})
