// Discord chat relay — gateway process.
//
// Holds the single Discord Gateway WebSocket and republishes normalized
// messages onto Redis for socket-server to fan out. Run by PM2 as
// `discord-chat` (ecosystem.config.cjs), and by `npm run discord-chat`.
//
// ── Why this is its own process ──────────────────────────────────────────────
// It could technically live inside socket-server, and that was the first plan.
// Three things ruled it out:
//
//  1. socket-server has no uncaughtException/unhandledRejection handler, and
//     its shutdown() — which persists live Clash matches — does not run on a
//     crash. A stray rejection from reconnect code would therefore destroy
//     every in-progress PvP/PvE match and trade room on the site. A separate
//     process cannot do that.
//  2. socket-server runs a 60Hz cannon-es physics world for the marble race
//     plus several DB-heavy intervals on the same event loop. Discord drops a
//     gateway connection whose heartbeat is late, and the traffic runs both
//     ways: a burst of chat would jitter a 60Hz simulation.
//  3. `pm2 reload socket-server` would otherwise drop the gateway, and during
//     the drain window two processes would briefly hold sessions and both
//     broadcast through the Redis adapter — duplicate messages on every deploy.
//
// Being a dedicated `instances: 1` fork is also what makes the single-connection
// guarantee structural, so there is no distributed lock here to rot.

import dotenv from 'dotenv'
dotenv.config()

import { prisma } from '../prisma.js'
import { getRedis } from '../utils/redis.js'
import { CHAT_CHANNELS } from '../utils/discordChat/constants.js'
import { loadChatConfig, rawBotToken, webhookCredentials } from '../utils/discordChat/config.js'
import { DiscordChatGateway } from '../utils/discordChat/gateway.js'

const redis = getRedis()
// A dedicated subscriber: an ioredis connection in subscriber mode cannot serve
// ordinary commands, and the gateway needs both.
const subscriber = redis.duplicate()

// Node 22 makes an unhandled rejection fatal. This process is deliberately
// isolated so that a crash costs only the chat sidebar, but a crash still costs
// an IDENTIFY on restart, and that budget is the one thing here that can damage
// the rest of the site. So: log and keep running.
process.on('unhandledRejection', (err) => {
  console.error('[DiscordChat] unhandled rejection:', err)
})
process.on('uncaughtException', (err) => {
  console.error('[DiscordChat] uncaught exception:', err)
})

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
  if (!config.discordChatEnabled) {
    // Not an error, and deliberately not a crash loop: a developer with no bot
    // token or an operator who has not switched the feature on should get a
    // quiet idle process, not a restart storm.
    console.log('[DiscordChat] relay is disabled; idling until an admin enables it.')
  }

  await subscriber.subscribe(CHAT_CHANNELS.configChanged)
  subscriber.on('message', (channel) => {
    if (channel !== CHAT_CHANNELS.configChanged) return
    gateway.onConfigChanged().catch((err) => {
      console.error('[DiscordChat] config reload failed:', err?.message || err)
    })
  })

  await gateway.start()

  // PM2 waits for this before considering the process up.
  if (process.send) process.send('ready')
}

async function shutdown(signal) {
  console.log(`[DiscordChat] ${signal} received, closing gateway`)
  try {
    // Closes with 4000 and persists the session, so the next boot RESUMEs
    // instead of spending an IDENTIFY, and replays anything sent meanwhile.
    await gateway.stop()
  } catch (err) {
    console.error('[DiscordChat] shutdown error:', err?.message || err)
  }
  try {
    await prisma.$disconnect()
  } catch {
    // best effort
  }
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

main().catch((err) => {
  console.error('[DiscordChat] failed to start:', err)
  // Exit non-zero so PM2's backoff restart applies rather than spinning.
  process.exit(1)
})
