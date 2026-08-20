// Discord Gateway v10 client for the chat relay. Uses Node 22's global
// WebSocket — one shard, JSON, no compression, receive-only, one guild/channel.
//
// The critical constraint: exceeding 1000 IDENTIFYs/24h makes Discord reset
// the bot token, breaking OAuth login, DMs, and every announcement path on
// the site. So: RESUME is preferred everywhere legal (RESUMEs aren't
// counted), a persisted IDENTIFY budget guards the reconnect loop, and
// zombie/reconnect closes use code 4000 — never 1000/1001, which invalidate
// the session and force a fresh IDENTIFY.

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

    // <#id>/<@&id> name caches, populated from GUILD_CREATE.
    this.nameCache = { channels: new Map(), roles: new Map() }
    this.config = null
    this.emptyContentStreak = 0
  }

  log(...args) { console.log('[DiscordChat]', ...args) }
  error(...args) { console.error('[DiscordChat]', ...args) }

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
      return false // can't prove we're in budget — refuse rather than risk it
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
    } catch {}
  }

  async saveSession() {
    try {
      await this.redis.set(CHAT_KEYS.session,
        JSON.stringify({ sessionId: this.sessionId, resumeUrl: this.resumeUrl, lastSeq: this.lastSeq }),
        'EX', 3600)
    } catch {}
  }

  async clearSession() {
    this.sessionId = null
    this.resumeUrl = null
    this.lastSeq = null
    try { await this.redis.del(CHAT_KEYS.session) } catch {}
  }

  async start() {
    this.stopped = false
    await this.loadSession()
    await this.connect()
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
    try { this.ws?.close(4000, 'shutdown') } catch {}
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
    this.error(`FATAL gateway close ${code}: ${reason}. Relay stopped, will not retry.`)
    if (code === 4014) {
      this.error('4014 = MESSAGE CONTENT intent not enabled (Developer Portal > Bot). No REST fallback: that intent gates the message data too, so polling would just render blank rows.')
    }
    try {
      await this.redis.set(CHAT_KEYS.fatal, JSON.stringify(this.fatal), 'EX', 86400)
      await this.publishState()
    } catch {}
    try { this.ws?.close(4000, 'fatal') } catch {}
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
        await this.goFatal(0, `IDENTIFY budget exceeded (>${IDENTIFY_LIMIT_PER_HOUR}/hour)`)
        return
      }
    }

    const url = `${base}?v=${GATEWAY_VERSION}&encoding=json`
    this.log(`connecting (${this.wantResume ? 'resume' : 'identify'})`)

    let ws
    try { ws = new WebSocket(url) }
    catch (err) { this.error('socket construction failed:', err?.message || err); this.scheduleReconnect(); return }
    this.ws = ws

    this.connectTimer = setTimeout(() => { this.error('no HELLO within timeout'); this.hardReconnect() }, CONNECT_TIMEOUT_MS)
    this.connectTimer.unref?.()

    ws.onmessage = (event) => this.onMessage(event).catch((err) => this.error('message handler:', err?.message || err))
    ws.onclose = (event) => this.onClose(event).catch((err) => this.error('close handler:', err?.message || err))
    ws.onerror = (event) => this.error('socket error:', event?.message || 'unknown')
  }

  scheduleReconnect() {
    if (this.stopped) return
    const base = Math.min(1000 * 2 ** this.backoffAttempt, 60_000)
    const delay = Math.random() * base
    this.backoffAttempt = Math.min(this.backoffAttempt + 1, 6)
    setTimeout(() => this.connect().catch((err) => this.error('reconnect failed:', err?.message || err)), delay).unref?.()
  }

  hardReconnect() {
    this.clearTimers()
    try { this.ws?.close(4000, 'reconnect') } catch {}
    // No .terminate() on Node's WebSocket — the close frame may never flush.
    setTimeout(() => {
      if (!this.stopped && (!this.ws || this.ws.readyState !== 1)) this.scheduleReconnect()
    }, 5000).unref?.()
  }

  send(payload) {
    try { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(payload)) }
    catch (err) { this.error('send failed:', err?.message || err) }
  }

  async onMessage(event) {
    let payload
    try { payload = JSON.parse(event.data) } catch { return }
    if (payload.s !== null && payload.s !== undefined) this.lastSeq = payload.s

    switch (payload.op) {
      case 10: await this.onHello(payload.d); break
      case 11: this.ackPending = false; break
      case 1: this.beat(); this.restartHeartbeat(); break
      case 7: this.log('op 7 RECONNECT'); this.hardReconnect(); break
      case 9: await this.onInvalidSession(payload.d); break
      case 0: await this.onDispatch(payload.t, payload.d); break
    }
  }

  async onHello(d) {
    if (this.connectTimer) clearTimeout(this.connectTimer)
    this.connectTimer = null
    this.heartbeatMs = Number(d?.heartbeat_interval) || 41250
    this.ackPending = false

    this.firstBeatTimer = setTimeout(() => { this.beat(); this.restartHeartbeat() }, this.heartbeatMs * Math.random())
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
    if (this.ackPending) { this.error('heartbeat not acked; reconnecting'); this.hardReconnect(); return }
    this.ackPending = true
    this.send({ op: 1, d: this.lastSeq })
  }

  async onInvalidSession(resumable) {
    this.log(`op 9 INVALID_SESSION (resumable=${resumable === true})`)
    if (resumable !== true) await this.clearSession()
    this.clearTimers()
    try { this.ws?.close(4000, 'invalid session') } catch {}
    setTimeout(() => this.connect().catch((err) => this.error('reconnect failed:', err?.message || err)), 1000 + Math.random() * 4000).unref?.()
  }

  async onClose(event) {
    const code = event?.code
    this.clearTimers()
    this.ws = null
    if (this.stopped) return

    this.log(`socket closed ${code} ${event?.reason || ''}`)

    if (FATAL_CLOSE_CODES.has(code)) {
      const hint = code === 4004
        ? 'authentication failed — check for a stray "Bot " prefix on the token'
        : event?.reason
      await this.goFatal(code, hint)
      return
    }

    if (SESSION_INVALIDATING_CLOSE_CODES.has(code)) await this.clearSession()
    else await this.saveSession()

    if (code === 4008) { // command rate limit blown
      setTimeout(() => this.connect().catch((err) => this.error('reconnect failed:', err?.message || err)), 30_000).unref?.()
      return
    }

    this.scheduleReconnect()
  }

  async onDispatch(type, d) {
    switch (type) {
      case 'READY':
        this.sessionId = d?.session_id ?? null
        this.resumeUrl = d?.resume_gateway_url ?? null
        this.backoffAttempt = 0
        await this.saveSession()
        await this.publishState()
        break
      case 'RESUMED':
        this.backoffAttempt = 0
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
        if (this.isOurChannel(d?.channel_id)) await this.onMessageDelete(d?.ids || [])
        break
    }
  }

  isOurChannel(channelId) {
    return Boolean(channelId) && String(channelId) === String(this.config?.discordChatChannelId)
  }

  async onGuildCreate(d) {
    this.nameCache.channels.clear()
    this.nameCache.roles.clear()
    for (const c of d?.channels || []) if (c?.id && c?.name) this.nameCache.channels.set(String(c.id), String(c.name))
    for (const r of d?.roles || []) if (r?.id && r?.name) this.nameCache.roles.set(String(r.id), String(r.name))

    // Channel absent from GUILD_CREATE is the only signal we lost VIEW_CHANNEL.
    const channelId = this.config?.discordChatChannelId
    const visible = channelId ? this.nameCache.channels.has(String(channelId)) : false
    if (channelId && !visible) {
      this.error(`bot cannot see channel ${channelId} — check VIEW_CHANNEL and READ_MESSAGE_HISTORY`)
    }
    await this.publishState({ channelMissing: Boolean(channelId) && !visible })
    await this.reseed()
  }

  async onMessageCreate(raw) {
    if (!this.isOurChannel(raw?.channel_id)) return

    // Our own relayed messages always have readable content, so a run of
    // empty content from real users means MESSAGE_CONTENT is off despite a
    // successful connection.
    if (raw?.content === '' && !raw?.webhook_id && !raw?.attachments?.length &&
        !raw?.embeds?.length && !raw?.sticker_items?.length && Number(raw?.type ?? 0) === 0) {
      this.emptyContentStreak++
      if (this.emptyContentStreak === 5) this.error('5 consecutive empty messages — MESSAGE CONTENT intent is probably disabled')
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

    const patch = {}
    if ('content' in raw || 'attachments' in raw) {
      const full = this.normalize({ ...raw, type: raw.type ?? 0, author: raw.author ?? { id: '0' } })
      if ('content' in raw && full) patch.tokens = full.tokens
      if ('attachments' in raw) patch.attachments = full ? full.attachments : []
    }
    if ('edited_timestamp' in raw) patch.editedAt = raw.edited_timestamp ? Date.parse(raw.edited_timestamp) : null
    if (!Object.keys(patch).length) return

    const updated = await bufferMerge(this.redis, id, patch)
    await this.publish({ kind: 'update', id, patch, message: updated })
  }

  async onMessageDelete(ids) {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String)
    if (!list.length) return
    await bufferDelete(this.redis, list)
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

  // Runs on connect and hourly: converges any missed deletes and refreshes
  // attachment CDN signatures, which expire after ~a day.
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
      this.error('reseed failed:', err?.message || err)
    }
  }

  async publish(event) {
    try { await this.redis.publish(CHAT_CHANNELS.events, JSON.stringify(event)) }
    catch (err) { this.error('publish failed:', err?.message || err) }
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

  async onConfigChanged() {
    const previous = this.config
    this.config = await this.loadConfig()

    if (previous?.discordChatChannelId !== this.config?.discordChatChannelId) {
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
