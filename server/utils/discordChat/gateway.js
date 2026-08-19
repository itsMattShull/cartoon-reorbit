// Discord Gateway v10 client for the chat relay.
//
// See constants.js for the import rules. Uses Node's global WebSocket (Node 22),
// so there is no new dependency.
//
// ── Scope ────────────────────────────────────────────────────────────────────
// One shard, JSON encoding, no compression, receive-only, one guild, one
// channel. That is small enough to own outright, and owning it means the
// reconnect policy is ours and is boring. If this ever grows a zlib inflater,
// sharding, or a generic event dispatcher, replace it with @discordjs/ws
// instead of continuing.
//
// ── The failure that actually matters ────────────────────────────────────────
// Discord terminates every session AND RESETS THE BOT TOKEN if an app exceeds
// 1000 IDENTIFYs in 24 hours. BOT_TOKEN in this repo is load-bearing for OAuth
// guild-join, DMs, achievement and auction announcements, and the guild-sync
// cron — so an IDENTIFY loop here would take down Discord login for the whole
// site, silently, and recovery is a manual token rotation.
//
// Three things guard that, and none of them are optional:
//   1. A persisted IDENTIFY budget (Redis, so a crash-loop cannot reset it).
//   2. RESUME is preferred everywhere it is legal; RESUMEs are not counted.
//   3. Zombie and reconnect closes use code 4000. Closing with 1000/1001
//      INVALIDATES the session server-side and forces a fresh IDENTIFY, which
//      would turn every routine reconnect into budget spend.

import {
  CHAT_KEYS,
  CHAT_CHANNELS,
  INTENTS,
  GATEWAY_VERSION,
  IDENTIFY_LIMIT_PER_HOUR,
  IDENTIFY_WINDOW_MS,
  FATAL_CLOSE_CODES,
  SESSION_INVALIDATING_CLOSE_CODES
} from './constants.js'
import { normalizeMessage } from './normalize.js'
import { bufferPut, bufferMerge, bufferDelete, bufferReplace, bufferClear } from './buffer.js'
import { fetchRecentMessages, discordFetch, botAuth } from './rest.js'

const CONNECT_TIMEOUT_MS = 20_000
const RESEED_INTERVAL_MS = 60 * 60 * 1000

export class DiscordChatGateway {
  constructor({ redis, prisma, loadConfig, rawToken, guildId, webhookId }) {
    this.redis = redis
    this.prisma = prisma
    this.loadConfig = loadConfig
    this.rawToken = rawToken
    this.guildId = guildId
    this.webhookId = webhookId

    this.ws = null
    this.stopped = false
    this.fatal = null

    this.sessionId = null
    this.resumeUrl = null
    this.lastSeq = null
    this.heartbeatMs = null
    this.heartbeatTimer = null
    this.firstBeatTimer = null
    this.connectTimer = null
    this.reseedTimer = null
    this.ackPending = false
    this.backoffAttempt = 0
    this.wantResume = false

    // Populated from GUILD_CREATE so <#id> and <@&id> render as names without
    // a REST call per message.
    this.nameCache = { channels: new Map(), roles: new Map() }

    this.config = null
    this.emptyContentStreak = 0
  }

  log(...args) {
    console.log('[DiscordChat]', ...args)
  }

  error(...args) {
    console.error('[DiscordChat]', ...args)
  }

  // ── IDENTIFY budget ────────────────────────────────────────────────────────

  async mayIdentify() {
    const now = Date.now()
    try {
      const raw = await this.redis.get(CHAT_KEYS.identifyLog)
      const log = raw ? JSON.parse(raw) : []
      const recent = log.filter((t) => now - t < IDENTIFY_WINDOW_MS)
      if (recent.length >= IDENTIFY_LIMIT_PER_HOUR) return false
      recent.push(now)
      await this.redis.set(CHAT_KEYS.identifyLog, JSON.stringify(recent), 'PX', IDENTIFY_WINDOW_MS * 2)
      return true
    } catch {
      // If Redis is unreachable we cannot prove we are within budget. Refusing
      // is the safe answer: a chat outage is recoverable, a reset bot token is
      // a manual incident.
      return false
    }
  }

  async loadSession() {
    try {
      const raw = await this.redis.get(CHAT_KEYS.session)
      if (!raw) return
      const s = JSON.parse(raw)
      this.sessionId = s.sessionId ?? null
      this.resumeUrl = s.resumeUrl ?? null
      this.lastSeq = s.lastSeq ?? null
    } catch {
      // start fresh
    }
  }

  async saveSession() {
    try {
      await this.redis.set(
        CHAT_KEYS.session,
        JSON.stringify({ sessionId: this.sessionId, resumeUrl: this.resumeUrl, lastSeq: this.lastSeq }),
        'EX',
        3600
      )
    } catch {
      // best effort
    }
  }

  async clearSession() {
    this.sessionId = null
    this.resumeUrl = null
    this.lastSeq = null
    try {
      await this.redis.del(CHAT_KEYS.session)
    } catch {
      // best effort
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start() {
    this.stopped = false
    await this.loadSession()
    await this.connect()
    // Periodic re-seed. Two jobs: it closes the gap where a delete or edit was
    // missed during a disconnect, and it refreshes attachment CDN signatures,
    // which expire after roughly a day and would otherwise serve dead images.
    this.reseedTimer = setInterval(() => {
      this.reseed().catch((err) => this.error('reseed failed:', err?.message || err))
    }, RESEED_INTERVAL_MS)
    this.reseedTimer.unref?.()
  }

  async stop() {
    this.stopped = true
    this.clearTimers()
    if (this.reseedTimer) clearInterval(this.reseedTimer)
    await this.saveSession()
    // 4000, never 1000/1001: this keeps the session alive server-side for a few
    // minutes so the next boot RESUMEs — costing no IDENTIFY and replaying the
    // messages sent during the restart.
    try {
      this.ws?.close(4000, 'shutdown')
    } catch {
      // already gone
    }
    this.ws = null
  }

  clearTimers() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.firstBeatTimer) clearTimeout(this.firstBeatTimer)
    if (this.connectTimer) clearTimeout(this.connectTimer)
    this.heartbeatTimer = null
    this.firstBeatTimer = null
    this.connectTimer = null
  }

  async goFatal(code, reason) {
    this.fatal = { code, reason, at: Date.now() }
    this.stopped = true
    this.clearTimers()
    this.error(`FATAL gateway close ${code}: ${reason}. Chat relay stopped and will not retry.`)
    if (code === 4014) {
      this.error(
        'Close 4014 means the MESSAGE CONTENT privileged intent is not enabled for this bot. ' +
          'Enable it at Discord Developer Portal > your app > Bot > Privileged Gateway Intents. ' +
          'There is deliberately no REST polling fallback: the intent gates the message DATA, ' +
          'not just the gateway, so REST would return messages with empty content and the ' +
          'sidebar would render blank rows instead of failing visibly.'
      )
    }
    try {
      await this.redis.set(CHAT_KEYS.fatal, JSON.stringify(this.fatal), 'EX', 86400)
      await this.publishState()
    } catch {
      // best effort
    }
    try {
      this.ws?.close(4000, 'fatal')
    } catch {
      // already gone
    }
  }

  async connect() {
    if (this.stopped) return
    this.clearTimers()

    this.config = await this.loadConfig()
    if (!this.config?.discordChatEnabled || !this.config?.discordChatChannelId) {
      this.log('relay disabled or unconfigured; not connecting')
      await this.publishState()
      return
    }
    if (!this.rawToken) {
      await this.goFatal(0, 'no bot token configured')
      return
    }

    // RESUME uses the url Discord handed us at READY; a fresh session uses the
    // discovery endpoint. Either way the query string must be appended by us —
    // resume_gateway_url comes back without one, and resuming requires the same
    // version and encoding as the original connection.
    this.wantResume = Boolean(this.sessionId && this.lastSeq !== null)
    let base = this.wantResume && this.resumeUrl ? this.resumeUrl : null
    if (!base) {
      try {
        const info = await discordFetch('/gateway/bot', { auth: botAuth(this.rawToken) })
        base = info?.url || 'wss://gateway.discord.gg'
      } catch (err) {
        this.error('gateway discovery failed:', err?.message || err)
        base = 'wss://gateway.discord.gg'
      }
    }

    if (!this.wantResume) {
      const allowed = await this.mayIdentify()
      if (!allowed) {
        await this.goFatal(
          0,
          `IDENTIFY budget exceeded (>${IDENTIFY_LIMIT_PER_HOUR}/hour). Refusing to reconnect: ` +
            'exceeding 1000 IDENTIFYs in 24h causes Discord to reset the bot token, which would ' +
            'break OAuth login, DMs and every announcement path on the site.'
        )
        return
      }
    }

    const url = `${base}?v=${GATEWAY_VERSION}&encoding=json`
    this.log(`connecting (${this.wantResume ? 'resume' : 'identify'})`)

    let ws
    try {
      ws = new WebSocket(url)
    } catch (err) {
      this.error('socket construction failed:', err?.message || err)
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    this.connectTimer = setTimeout(() => {
      this.error('no HELLO within timeout; reconnecting')
      this.hardReconnect()
    }, CONNECT_TIMEOUT_MS)
    this.connectTimer.unref?.()

    // Every callback is wrapped. An unhandled rejection is fatal under Node 22,
    // and while this runs in its own process, a crash still costs an IDENTIFY
    // on restart — which is the budget above.
    ws.onmessage = (event) => {
      this.onMessage(event).catch((err) => this.error('message handler:', err?.message || err))
    }
    ws.onclose = (event) => {
      this.onClose(event).catch((err) => this.error('close handler:', err?.message || err))
    }
    ws.onerror = (event) => {
      this.error('socket error:', event?.message || 'unknown')
    }
  }

  scheduleReconnect() {
    if (this.stopped) return
    // Full jitter. Reset only on READY/RESUMED, never merely on TCP connect —
    // otherwise a gateway that accepts the socket and immediately closes it
    // produces an infinite fast loop.
    const base = Math.min(1000 * 2 ** this.backoffAttempt, 60_000)
    const delay = Math.random() * base
    this.backoffAttempt = Math.min(this.backoffAttempt + 1, 6)
    this.log(`reconnecting in ${Math.round(delay)}ms`)
    setTimeout(() => {
      this.connect().catch((err) => this.error('reconnect failed:', err?.message || err))
    }, delay).unref?.()
  }

  hardReconnect() {
    this.clearTimers()
    try {
      // 4000 preserves the session for a RESUME. See the class header.
      this.ws?.close(4000, 'reconnect')
    } catch {
      // already gone
    }
    // The close frame may never flush if the socket is genuinely wedged, and
    // Node's WebSocket has no terminate(). This guarantees forward progress.
    setTimeout(() => {
      if (!this.stopped && (!this.ws || this.ws.readyState !== 1)) this.scheduleReconnect()
    }, 5000).unref?.()
  }

  send(payload) {
    try {
      if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(payload))
    } catch (err) {
      this.error('send failed:', err?.message || err)
    }
  }

  // ── Protocol ───────────────────────────────────────────────────────────────

  async onMessage(event) {
    let payload
    try {
      payload = JSON.parse(event.data)
    } catch {
      return
    }
    if (payload.s !== null && payload.s !== undefined) this.lastSeq = payload.s

    switch (payload.op) {
      case 10:
        await this.onHello(payload.d)
        break
      case 11:
        this.ackPending = false
        break
      case 1:
        // Discord asking for a beat out of band. Answer immediately and restart
        // the interval so we do not double-beat.
        this.beat()
        this.restartHeartbeat()
        break
      case 7:
        // Routine load-shedding, not an error: do not count it against backoff.
        this.log('op 7 RECONNECT')
        this.hardReconnect()
        break
      case 9:
        await this.onInvalidSession(payload.d)
        break
      case 0:
        await this.onDispatch(payload.t, payload.d)
        break
      default:
        break
    }
  }

  async onHello(d) {
    if (this.connectTimer) clearTimeout(this.connectTimer)
    this.connectTimer = null
    this.heartbeatMs = Number(d?.heartbeat_interval) || 41250
    this.ackPending = false

    // The jitter is a FIRST-BEAT offset only, not a per-beat wobble.
    this.firstBeatTimer = setTimeout(() => {
      this.beat()
      this.restartHeartbeat()
    }, this.heartbeatMs * Math.random())
    this.firstBeatTimer.unref?.()

    if (this.wantResume && this.sessionId && this.lastSeq !== null) {
      this.send({ op: 6, d: { token: this.rawToken, session_id: this.sessionId, seq: this.lastSeq } })
    } else {
      this.send({
        op: 2,
        d: {
          token: this.rawToken,
          intents: INTENTS,
          properties: { os: 'linux', browser: 'cartoon-reorbit', device: 'cartoon-reorbit' },
          // The bot has been REST-only until now, so it has always rendered as
          // offline in the member list. Staying invisible keeps that true.
          presence: { since: null, activities: [], status: 'invisible', afk: false }
        }
      })
    }
  }

  restartHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(() => this.beat(), this.heartbeatMs)
    this.heartbeatTimer.unref?.()
  }

  beat() {
    if (this.ackPending) {
      // Zombie connection: the socket is open but Discord is not answering.
      this.error('heartbeat not acked; reconnecting')
      this.hardReconnect()
      return
    }
    this.ackPending = true
    this.send({ op: 1, d: this.lastSeq })
  }

  async onInvalidSession(resumable) {
    this.log(`op 9 INVALID_SESSION (resumable=${resumable === true})`)
    if (resumable !== true) await this.clearSession()
    this.clearTimers()
    try {
      this.ws?.close(4000, 'invalid session')
    } catch {
      // already gone
    }
    // The 1-5s wait is convention rather than spec, but it exists because
    // IDENTIFY is concurrency-capped and hammering earns another op 9.
    setTimeout(() => {
      this.connect().catch((err) => this.error('reconnect failed:', err?.message || err))
    }, 1000 + Math.random() * 4000).unref?.()
  }

  async onClose(event) {
    const code = event?.code
    const reason = event?.reason || ''
    this.clearTimers()
    this.ws = null
    if (this.stopped) return

    this.log(`socket closed ${code} ${reason}`)

    if (FATAL_CLOSE_CODES.has(code)) {
      let hint = reason
      if (code === 4004) {
        hint =
          'authentication failed. The most common cause here is the "Bot " prefix: .env stores ' +
          'BOT_TOKEN with it for REST calls, but the gateway IDENTIFY needs the bare token.'
      }
      await this.goFatal(code, hint)
      return
    }

    if (SESSION_INVALIDATING_CLOSE_CODES.has(code)) await this.clearSession()
    else await this.saveSession()

    // 4008 means the 120-events-per-60s command budget was blown. Nothing here
    // should ever approach that, so treat it as a real problem and wait.
    if (code === 4008) {
      setTimeout(() => {
        this.connect().catch((err) => this.error('reconnect failed:', err?.message || err))
      }, 30_000).unref?.()
      return
    }

    this.scheduleReconnect()
  }

  // ── Dispatch ───────────────────────────────────────────────────────────────

  async onDispatch(type, d) {
    switch (type) {
      case 'READY':
        this.sessionId = d?.session_id ?? null
        this.resumeUrl = d?.resume_gateway_url ?? null
        this.backoffAttempt = 0
        await this.saveSession()
        this.log('READY')
        await this.publishState()
        break

      case 'RESUMED':
        this.backoffAttempt = 0
        this.log('RESUMED')
        await this.publishState()
        break

      case 'GUILD_CREATE':
        if (String(d?.id) === String(this.guildId)) await this.onGuildCreate(d)
        break

      case 'CHANNEL_UPDATE':
        if (d?.id && d?.name) this.nameCache.channels.set(String(d.id), String(d.name))
        break

      case 'CHANNEL_DELETE':
        if (d?.id) {
          this.nameCache.channels.delete(String(d.id))
          if (String(d.id) === String(this.config?.discordChatChannelId)) {
            this.error('the configured chat channel was deleted')
            await this.publishState({ channelMissing: true })
          }
        }
        break

      case 'GUILD_ROLE_CREATE':
      case 'GUILD_ROLE_UPDATE':
        if (d?.role?.id) this.nameCache.roles.set(String(d.role.id), String(d.role.name || 'role'))
        break

      case 'GUILD_ROLE_DELETE':
        if (d?.role_id) this.nameCache.roles.delete(String(d.role_id))
        break

      case 'MESSAGE_CREATE':
        await this.onMessageCreate(d)
        break

      case 'MESSAGE_UPDATE':
        await this.onMessageUpdate(d)
        break

      case 'MESSAGE_DELETE':
        if (this.isOurChannel(d?.channel_id)) await this.onMessageDelete([d?.id])
        break

      case 'MESSAGE_DELETE_BULK':
        // A moderator purge. `ids` is an array.
        if (this.isOurChannel(d?.channel_id)) await this.onMessageDelete(d?.ids || [])
        break

      default:
        break
    }
  }

  isOurChannel(channelId) {
    return Boolean(channelId) && String(channelId) === String(this.config?.discordChatChannelId)
  }

  async onGuildCreate(d) {
    // Extract the two name caches and the permission signal, then drop the
    // payload — it can be a megabyte and none of the rest is needed.
    this.nameCache.channels.clear()
    this.nameCache.roles.clear()
    for (const c of d?.channels || []) {
      if (c?.id && c?.name) this.nameCache.channels.set(String(c.id), String(c.name))
    }
    for (const r of d?.roles || []) {
      if (r?.id && r?.name) this.nameCache.roles.set(String(r.id), String(r.name))
    }

    // The configured channel being absent is the ONLY signal that the bot has
    // lost VIEW_CHANNEL. Without this check, losing that permission presents as
    // "connected, but nobody is talking" — which is undiagnosable from logs.
    const channelId = this.config?.discordChatChannelId
    const visible = channelId ? this.nameCache.channels.has(String(channelId)) : false
    if (channelId && !visible) {
      this.error(
        `the bot cannot see channel ${channelId}. Check that it has VIEW_CHANNEL (and ` +
          'READ_MESSAGE_HISTORY for backfill) on that channel.'
      )
    }
    await this.publishState({ channelMissing: Boolean(channelId) && !visible })
    await this.reseed()
  }

  async onMessageCreate(raw) {
    if (!this.isOurChannel(raw?.channel_id)) return

    // Detects a silently mis-scoped intent. Our own relayed messages always
    // have readable content (an app can always see content in messages it
    // sent), so a run of empty inbound messages from real users means
    // MESSAGE_CONTENT is off even though the connection succeeded.
    if (
      raw?.content === '' &&
      !raw?.webhook_id &&
      !raw?.attachments?.length &&
      !raw?.embeds?.length &&
      !raw?.sticker_items?.length &&
      Number(raw?.type ?? 0) === 0
    ) {
      this.emptyContentStreak++
      if (this.emptyContentStreak === 5) {
        this.error(
          'five consecutive inbound messages had empty content. The MESSAGE CONTENT ' +
            'privileged intent is probably disabled for this bot.'
        )
      }
    } else if (raw?.content) {
      this.emptyContentStreak = 0
    }

    const message = this.normalize(raw)
    if (!message) return
    await bufferPut(this.redis, message)
    await this.publish({ kind: 'message', message })
  }

  async onMessageUpdate(raw) {
    if (!this.isOurChannel(raw?.channel_id)) return
    const id = String(raw?.id ?? '')
    if (!id) return

    // Build a patch of only the keys this payload actually carries. An
    // embed-unfurl update carries neither author nor content, so normalizing it
    // wholesale would blank the message.
    const patch = {}
    if ('content' in raw) {
      const full = this.normalize({ ...raw, type: raw.type ?? 0, author: raw.author ?? { id: '0' } })
      if (full) patch.tokens = full.tokens
    }
    if ('attachments' in raw) {
      const full = this.normalize({ ...raw, type: raw.type ?? 0, author: raw.author ?? { id: '0' } })
      patch.attachments = full ? full.attachments : []
    }
    if ('edited_timestamp' in raw) {
      patch.editedAt = raw.edited_timestamp ? Date.parse(raw.edited_timestamp) : null
    }
    if (!Object.keys(patch).length) return

    const updated = await bufferMerge(this.redis, id, patch)
    // Emitted even when the id has scrolled out of the server buffer: clients
    // hold more messages than the buffer does.
    await this.publish({ kind: 'update', id, patch, message: updated })
  }

  async onMessageDelete(ids) {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String)
    if (!list.length) return
    await bufferDelete(this.redis, list)
    // Unconditional. A moderator removing something must see it disappear from
    // the site whether or not the server still has it buffered.
    await this.publish({ kind: 'delete', ids: list })
  }

  normalize(raw) {
    return normalizeMessage(raw, {
      webhookId: this.webhookId,
      guildId: this.guildId,
      nameCache: this.nameCache,
      showAttachments: this.config?.discordChatShowAttachments === true
    })
  }

  /**
   * Re-seeds the buffer from REST.
   *
   * Runs on connect (so a restart never leaves clients with an empty panel) and
   * hourly (so missed deletes converge and attachment signatures stay fresh).
   */
  async reseed() {
    const channelId = this.config?.discordChatChannelId
    if (!channelId) return
    try {
      const rawList = await fetchRecentMessages(channelId, this.rawToken, 50)
      const messages = []
      for (const raw of rawList) {
        const m = this.normalize(raw)
        if (m) messages.push(m)
      }
      await bufferReplace(this.redis, messages)
      await this.publish({ kind: 'reseed', messages })
    } catch (err) {
      // Never block on Discord. An empty buffer is a worse-looking panel, not a
      // broken one.
      this.error('reseed failed:', err?.message || err)
    }
  }

  async publish(event) {
    try {
      await this.redis.publish(CHAT_CHANNELS.events, JSON.stringify(event))
    } catch (err) {
      this.error('publish failed:', err?.message || err)
    }
  }

  async publishState(extra = {}) {
    await this.publish({
      kind: 'state',
      state: {
        enabled: this.config?.discordChatEnabled === true,
        connected: !this.fatal && this.ws?.readyState === 1,
        fatal: this.fatal ? { code: this.fatal.code } : null,
        ...extra
      }
    })
  }

  /** Called when an admin saves new config. */
  async onConfigChanged() {
    const previous = this.config
    this.config = await this.loadConfig()

    const channelChanged = previous?.discordChatChannelId !== this.config?.discordChatChannelId
    if (channelChanged) {
      // Otherwise the panel would show a mixed history from two channels.
      await bufferClear(this.redis)
      await this.reseed()
    }

    if (!this.config?.discordChatEnabled) {
      await bufferClear(this.redis)
      await this.publishState()
      return
    }
    if (!this.ws && !this.fatal) await this.connect()
    else await this.publishState()
  }
}
