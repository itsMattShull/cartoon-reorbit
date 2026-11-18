<template>
  <div v-if="user && enabled">
    <!-- ── Launcher pill — shown only when the window itself is fully closed ─────────────── -->
    <button
      v-if="uiState === 'closed'" type="button" class="mow-launcher"
      @click="uiState = 'minimized'"
    >🧑‍🚀 MyOrbit</button>

    <!-- ── Minimized tab — room membership (if any) stays live, just not visible ──────────── -->
    <button
      v-else-if="uiState === 'minimized'" type="button" class="mow-launcher"
      @click="uiState = 'open'"
    >🧑‍🚀 MyOrbit{{ currentRoomId ? ' (in a room)' : '' }}</button>

    <!-- ── Open window ─────────────────────────────────────────────────────────────────────── -->
    <div v-else ref="windowEl" class="mow-window" :class="{ 'mow-window-maximized': maximized }" :style="dragStyle">
      <div class="mow-header" @pointerdown="onHeaderPointerDown">
        <span class="mow-title">MyOrbit</span>
        <div class="mow-header-btns">
          <button type="button" class="mow-header-btn" :title="maximized ? 'Restore' : 'Maximize'" @click.stop="maximized = !maximized">{{ maximized ? '❐' : '⛶' }}</button>
          <button type="button" class="mow-header-btn" title="Minimize" @click.stop="uiState = 'minimized'">–</button>
          <button type="button" class="mow-header-btn" title="Close" @click.stop="onClose">✕</button>
        </div>
      </div>

      <div class="mow-body">
        <p v-if="lastError" class="mow-error">{{ lastError }}</p>

        <!-- ── "Squad up" — someone invited me into their raid from this (or another) room ──── -->
        <div v-if="raidSocket.incomingInvite.value" class="mow-invite-banner">
          <span>⚔️ <strong>{{ raidSocket.incomingInvite.value.fromUsername }}</strong> invited you to fight <strong>{{ raidSocket.incomingInvite.value.enemyName }}</strong>!</span>
          <div class="mow-invite-banner-btns">
            <button type="button" class="mow-invite-join-btn" @click="onJoinInvitedRaid">Join</button>
            <button type="button" class="mow-invite-dismiss-btn" @click="raidSocket.dismissInvite">✕</button>
          </div>
        </div>

        <!-- ── Room list / avatar picker ─────────────────────────────────────────────────── -->
        <div v-if="view === 'rooms'" class="mow-rooms">
          <p v-if="roomsError" class="mow-error">{{ roomsError }}</p>
          <div class="mow-avatar-pick">
            <p class="mow-section-label">Your avatar</p>
            <p v-if="!myCtoons.length" class="mow-hint">You don't own any cToons to walk around as yet.</p>
            <div v-else class="mow-avatar-strip">
              <button
                v-for="c in myCtoons" :key="c.id" type="button" class="mow-avatar-thumb"
                :class="selectedCtoonId === c.id ? 'mow-avatar-thumb-selected' : ''"
                :title="c.name" @click="selectedCtoonId = c.id"
              ><img :src="c.assetPath" :alt="c.name" /></button>
            </div>
          </div>
          <p class="mow-section-label">Rooms</p>
          <p v-if="!availableRooms.length" class="mow-hint">No rooms are open right now.</p>
          <div v-else class="mow-room-list">
            <button
              v-for="r in availableRooms" :key="r.id" type="button" class="mow-room-row"
              :style="r.theme ? { borderLeft: `3px solid ${r.theme.color}` } : {}"
              :disabled="!selectedCtoonId" @click="onJoin(r.id)"
            >
              <img v-if="r.theme?.iconPath" :src="r.theme.iconPath" alt="" class="mow-room-theme-icon" />
              <span class="mow-room-name">{{ r.name }}</span>
              <span v-if="r.isHomeTurf" class="mow-home-turf-badge" title="Your faction's room">🏠</span>
              <span v-if="r.isRaidDen" class="mow-raid-den-badge" title="Live raid spectating">⚔️</span>
              <span class="mow-room-size">{{ r.gridWidth }}x{{ r.gridHeight }}</span>
            </button>
          </div>
        </div>

        <!-- ── In a room: isometric canvas + chat ────────────────────────────────────────── -->
        <div v-else class="mow-room">
          <div class="mow-room-toolbar" :style="roomState?.theme ? { borderLeft: `3px solid ${roomState.theme.color}` } : {}">
            <span class="mow-room-title">
              <img v-if="roomState?.theme?.iconPath" :src="roomState.theme.iconPath" alt="" class="mow-room-theme-icon" />
              {{ roomState?.name || 'Loading…' }}
              <span v-if="isHomeTurf" class="mow-home-turf-badge" title="Your faction's room">🏠</span>
            </span>
            <button type="button" class="mow-leave-btn" @click="onLeave">Leave</button>
          </div>
          <div v-if="roomState?.isRaidDen" class="mow-raid-den">
            <template v-if="activeRaid">
              <div class="mow-raid-den-head">
                <img v-if="activeRaid.enemyImagePath" :src="activeRaid.enemyImagePath" alt="" class="mow-raid-den-portrait" />
                <div class="mow-raid-den-info">
                  <span class="mow-raid-den-name">{{ activeRaid.enemyName }} — Round {{ activeRaid.roundNumber }}</span>
                  <div class="mow-raid-den-hpbar"><div class="mow-raid-den-hpfill" :style="{ width: raidHpPercent + '%' }"></div></div>
                </div>
              </div>
              <p v-if="activeRaid.lastRoundSummary" class="mow-raid-den-log">{{ activeRaid.lastRoundSummary }}</p>
            </template>
            <p v-else class="mow-raid-den-idle">No raid in progress right now.</p>
          </div>
          <div class="mow-stage-wrap">
            <div v-if="roomState" class="mow-stage" :style="{ width: stage.width + 'px', height: stage.height + 'px' }">
              <img
                v-for="t in floorTiles" :key="`floor-${t.x}-${t.y}`" :src="t.assetPath" alt=""
                class="mow-layer-img" :style="{ left: t.left + 'px', top: t.top + 'px', width: TILE_WIDTH + 'px', height: TILE_HEIGHT + 'px', zIndex: t.z }"
              />
              <img
                v-for="(f, i) in furniturePieces" :key="`furn-${i}`" :src="f.assetPath" alt=""
                class="mow-layer-img" :style="{ left: f.left + 'px', top: f.top + 'px', width: f.renderWidth + 'px', height: f.renderHeight + 'px', zIndex: f.z }"
              />
              <button
                v-for="cell in gridCellTargets" :key="`hit-${cell.x}-${cell.y}`" type="button"
                class="mow-cell-hit" :style="{ left: cell.left + 'px', top: cell.top + 'px', width: TILE_WIDTH + 'px', height: TILE_HEIGHT + 'px', zIndex: 100000 + cell.x + cell.y }"
                @click="moveTo(cell.x, cell.y)"
              ></button>
              <div
                v-for="p in avatarTokens" :key="p.userId" class="mow-avatar-token"
                :class="[p.isMe ? 'mow-avatar-token-me' : '', landedUsers[p.userId] ? 'mow-avatar-landed' : '']"
                :style="{ left: p.left + 'px', top: p.top + 'px', zIndex: p.z }"
                @transitionend="onAvatarTransitionEnd(p.userId, $event)"
              >
                <div v-if="bubbles[p.userId]" class="mow-speech-bubble">{{ bubbles[p.userId].text }}</div>
                <div class="mow-avatar-img-wrap">
                  <span v-if="emoteIcons[p.userId]" class="mow-emote-pop">{{ emoteIcons[p.userId].icon }}</span>
                  <img :src="p.ctoonAssetPath" alt="" class="mow-avatar-img" />
                  <span v-if="p.cmoon" class="mow-flair mow-flair-cmoon" :style="{ borderColor: p.cmoon.color }" :title="p.cmoon.name">
                    <img v-if="p.cmoon.iconPath" :src="p.cmoon.iconPath" alt="" />
                  </span>
                  <span v-if="p.isAdmin" class="mow-flair mow-flair-admin" title="Admin">👑</span>
                  <button
                    v-if="!p.isMe && canInviteToRaid" type="button" class="mow-invite-btn"
                    :title="`Invite ${p.username} to your raid`" @click.stop="onInviteToRaid(p.userId)"
                  >{{ invitedUsers[p.userId] ? '✓' : '⚔️' }}</button>
                </div>
                <span class="mow-avatar-name">{{ p.username }}</span>
              </div>
            </div>
          </div>
          <div class="mow-chat">
            <div ref="chatLogEl" class="mow-chat-log">
              <p v-for="m in chatMessages" :key="m.id" class="mow-chat-line">
                <strong>{{ m.username }}:</strong> {{ m.message }}
              </p>
            </div>
            <div v-if="showEmotePicker" class="mow-emote-picker">
              <button
                v-for="e in MYORBIT_EMOTES" :key="e.key" type="button" class="mow-emote-btn"
                :title="e.label" @click="onSendEmote(e.key)"
              >{{ e.icon }}</button>
            </div>
            <form class="mow-chat-form" @submit.prevent="onSendChat">
              <button type="button" class="mow-emote-toggle" title="Emotes" @click="showEmotePicker = !showEmotePicker">😀</button>
              <input v-model="chatInput" maxlength="300" placeholder="Say something…" class="mow-chat-input" />
              <button type="submit" class="mow-chat-send" :disabled="!chatInput.trim()">Send</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { TILE_WIDTH, TILE_HEIGHT, MYORBIT_LAYER, gridStageSize, tileScreenPosition, depthIndex, effectiveFootprint } from '~/utils/myOrbitIsometric'
import { MYORBIT_EMOTES, myOrbitEmoteIcon } from '~/utils/myOrbitEmotes'
import { useMyOrbitSocket } from '~/composables/useMyOrbitSocket'
import { useBattleMusic } from '~/composables/useBattleMusic'
import { useHapticSoundsPref } from '~/composables/useHapticSoundsPref'
import { useCMoonRaidSocket } from '~/composables/useCMoonRaidSocket'

const { user } = useAuth()
const {
  roomState, lastError, currentRoomId, chatMessages, lastEmoteEvent,
  joinRoom, leaveRoom, moveTo, sendChat, sendEmote, inviteToRaid
} = useMyOrbitSocket()
const raidSocket = useCMoonRaidSocket()

// closed (nothing shown) -> minimized (small tab, room membership stays live) -> open (full window)
const uiState = ref('closed')
const view = ref('rooms') // 'rooms' | 'room' — only meaningful while uiState !== 'closed'
const enabled = ref(false)

const availableRooms = ref([])
const roomsError = ref('')
const myCtoons = ref([])
const selectedCtoonId = ref(null)

async function checkEnabled() {
  try {
    const res = await $fetch('/api/myorbit/config')
    enabled.value = !!res?.enabled
  } catch {
    enabled.value = false
  }
}

async function loadRoomsAndAvatars() {
  roomsError.value = ''
  try {
    const [roomsRes, ctoonsRes] = await Promise.all([
      $fetch('/api/myorbit/rooms'),
      $fetch('/api/myorbit/my-ctoons')
    ])
    availableRooms.value = roomsRes?.rooms || []
    myCtoons.value = ctoonsRes?.ctoons || []
    if (!selectedCtoonId.value) {
      const lastId = ctoonsRes?.lastUserCtoonId
      if (lastId && myCtoons.value.some(c => c.id === lastId)) selectedCtoonId.value = lastId
    }
  } catch (e) {
    roomsError.value = e?.data?.statusMessage || 'Failed to load rooms'
  }
}

// Fetched once the window is first opened, not on every layout mount — a logged-in visitor who
// never opens MyOrbit shouldn't cost two extra requests on every single page load.
let openedOnce = false
watch(uiState, (next) => {
  if (next !== 'closed' && !openedOnce) {
    openedOnce = true
    loadRoomsAndAvatars()
  }
})

onMounted(() => { if (user.value) checkEnabled() })
watch(() => user.value?.id, (id) => { if (id) checkEnabled() })

function onJoin(roomId) {
  if (!selectedCtoonId.value) return
  joinRoom(roomId, selectedCtoonId.value)
  view.value = 'room'
}
function onLeave() {
  leaveRoom()
  view.value = 'rooms'
  loadRoomsAndAvatars() // refresh in case a room was opened/closed/renamed while we were in one
}
function onClose() {
  if (currentRoomId.value) leaveRoom()
  view.value = 'rooms'
  uiState.value = 'closed'
}
// A live kick (ban) or a dropped-too-long reconnect clears currentRoomId from underneath us —
// bounce back to the room list rather than leaving the canvas frozen on a room we're no longer in.
// Also covers a rejected join (room full, banned, MyOrbit disabled...) — useMyOrbitSocket.js's
// own myorbit:error handler clears currentRoomId back to null when that happens, since it was
// only ever set optimistically before the server confirmed.
watch(currentRoomId, (id) => { if (!id) view.value = 'rooms' })

// ── Isometric stage ──────────────────────────────────────────────────────────────────────────
const stage = computed(() => roomState.value ? gridStageSize(roomState.value.gridWidth, roomState.value.gridHeight) : { width: 0, height: 0, offsetX: 0, offsetY: 0 })

const gridCellTargets = computed(() => {
  if (!roomState.value) return []
  const out = []
  for (let y = 0; y < roomState.value.gridHeight; y++) {
    for (let x = 0; x < roomState.value.gridWidth; x++) {
      const pos = tileScreenPosition(x, y, stage.value)
      out.push({ x, y, left: pos.left, top: pos.top })
    }
  }
  return out
})
const floorTiles = computed(() => {
  if (!roomState.value) return []
  return roomState.value.tiles.map(t => {
    const pos = tileScreenPosition(t.x, t.y, stage.value)
    return { x: t.x, y: t.y, left: pos.left, top: pos.top, assetPath: t.assetPath, z: depthIndex(t.x, t.y, 1, 1, MYORBIT_LAYER.FLOOR) }
  })
})
const furniturePieces = computed(() => {
  if (!roomState.value) return []
  return roomState.value.furniture.map(f => {
    const pos = tileScreenPosition(f.x, f.y, stage.value)
    const { width, height } = effectiveFootprint(f.footprintW, f.footprintH, f.rotation)
    return {
      left: pos.left, top: pos.top,
      renderWidth: width * TILE_WIDTH, renderHeight: height * TILE_HEIGHT + TILE_HEIGHT,
      assetPath: f.assetPath,
      z: depthIndex(f.x, f.y, width, height, MYORBIT_LAYER.FURNITURE) + f.zOffset
    }
  })
})
// CSS transition on left/top (see .mow-avatar-token below) is what turns each server-broadcast
// position update into a glide rather than a teleport — no client-side animation code needed.
const avatarTokens = computed(() => {
  if (!roomState.value) return []
  return (roomState.value.participants || []).map(p => {
    const pos = tileScreenPosition(p.x, p.y, stage.value)
    return {
      userId: p.userId, username: p.username, ctoonAssetPath: p.ctoonAssetPath,
      cmoon: p.cmoon, isAdmin: p.isAdmin,
      isMe: p.userId === user.value?.id,
      left: pos.left + TILE_WIDTH / 4, top: pos.top - 28,
      z: depthIndex(p.x, p.y, 1, 1, MYORBIT_LAYER.AVATAR)
    }
  })
})

// A brief "landing bounce" the instant a glide finishes — transitionend fires once per animated
// CSS property, so this is keyed on left/top specifically (ignoring any other property a future
// style change might also transition) rather than firing on every stray transitionend bubble.
const landedUsers = ref({})
function onAvatarTransitionEnd(userId, e) {
  if (e.propertyName !== 'left' && e.propertyName !== 'top') return
  landedUsers.value = { ...landedUsers.value, [userId]: true }
  setTimeout(() => {
    if (!landedUsers.value[userId]) return
    const next = { ...landedUsers.value }
    delete next[userId]
    landedUsers.value = next
  }, 260)
}

// ── "Squad up in-room" — invite another player standing here into my own currently-FORMING
// raid (see myorbit:inviteToRaid in server/utils/myOrbitSocket.js). Only enabled while my own
// cMoon-raid socket shows I'm genuinely the current/joined party of a still-forming raid — once
// combat starts (status flips to IN_PROGRESS) the server rejects new joins anyway, so the button
// hides rather than inviting into a raid the target could never actually enter.
const canInviteToRaid = computed(() => {
  const raid = raidSocket.raidState.value
  return !!(raid?.id && raid.id === raidSocket.currentRaidId.value && raid.status === 'FORMING')
})
const invitedUsers = ref({})
function onInviteToRaid(userId) {
  inviteToRaid(userId)
  invitedUsers.value = { ...invitedUsers.value, [userId]: true }
  setTimeout(() => {
    const next = { ...invitedUsers.value }
    delete next[userId]
    invitedUsers.value = next
  }, 1800)
}

// Receiving an invite — a one-shot banner (see raidSocket.incomingInvite), not scoped to any
// particular room: the inviter and I only needed to share a room at the moment they clicked.
const router = useRouter()
function onJoinInvitedRaid() {
  const raidId = raidSocket.incomingInvite.value?.raidId
  raidSocket.dismissInvite()
  if (raidId) router.push(`/newsite/cmoon-raid/${raidId}`)
}

// ── Faction war rooms — purely cosmetic branding; "home turf" just means MY own current cMoon
// matches this room's theme, never a join restriction (see MyOrbitRoom.themeCMoonId's own
// schema comment: themed rooms stay open to everyone).
const isHomeTurf = computed(() => {
  const themeId = roomState.value?.theme?.id
  if (!themeId) return false
  const mine = (roomState.value?.participants || []).find(p => p.userId === user.value?.id)
  return mine?.cmoon?.id === themeId
})

// ── Raid Den — polls the live "what raid boss fight is happening right now" summary while
// standing in a room flagged isRaidDen. A plain REST poll, not a socket subscription: the raid's
// own live state lives in cmoonRaidSocket.js's in-memory process (see that endpoint's own
// comment on why Postgres can't serve this), and polling every few seconds is plenty for an
// ambient "something's happening" spectator view — this isn't combat-critical timing.
const activeRaid = ref(null)
const raidHpPercent = computed(() => {
  const r = activeRaid.value
  if (!r || !r.maxHp) return 0
  return Math.max(0, Math.min(100, Math.round((r.hpRemaining / r.maxHp) * 100)))
})
let raidDenPollTimer = null
async function pollActiveRaid() {
  try {
    const res = await $fetch('/api/myorbit/active-raid')
    activeRaid.value = res?.raid || null
  } catch {
    // Transient fetch failures just leave the last-known state on screen - this is a
    // spectator convenience, not something worth surfacing an error for.
  }
}
function syncRaidDenPolling() {
  const shouldPoll = !!roomState.value?.isRaidDen
  if (shouldPoll && !raidDenPollTimer) {
    pollActiveRaid()
    raidDenPollTimer = setInterval(pollActiveRaid, 7000)
  } else if (!shouldPoll && raidDenPollTimer) {
    clearInterval(raidDenPollTimer)
    raidDenPollTimer = null
    activeRaid.value = null
  }
}
watch(() => roomState.value?.isRaidDen, syncRaidDenPolling)
onBeforeUnmount(() => { if (raidDenPollTimer) clearInterval(raidDenPollTimer) })

// ── Chat speech bubbles — transient, keyed by sender, cleared on timeout or on a live retraction ──
const bubbles = ref({})
watch(chatMessages, (msgs) => {
  const presentIds = new Set(msgs.map(m => m.id))
  let next = bubbles.value
  let changed = false
  for (const [uid, b] of Object.entries(next)) {
    if (!presentIds.has(b.id)) { if (!changed) next = { ...next }; delete next[uid]; changed = true }
  }
  if (changed) bubbles.value = next
  const last = msgs[msgs.length - 1]
  if (last && bubbles.value[last.userId]?.id !== last.id) {
    const id = last.id
    bubbles.value = { ...bubbles.value, [last.userId]: { text: last.message, id } }
    setTimeout(() => {
      if (bubbles.value[last.userId]?.id === id) {
        const copy = { ...bubbles.value }
        delete copy[last.userId]
        bubbles.value = copy
      }
    }, 4000)
  }
  nextTick(() => { if (chatLogEl.value) chatLogEl.value.scrollTop = chatLogEl.value.scrollHeight })
})
watch(currentRoomId, () => { bubbles.value = {} })

const chatInput = ref('')
const chatLogEl = ref(null)
function onSendChat() {
  const text = chatInput.value.trim()
  if (!text) return
  sendChat(text)
  chatInput.value = ''
}

// ── Emotes — a one-shot pop over the sender's avatar, not a log (unlike chat's bubbles above) ──
const showEmotePicker = ref(false)
const emoteIcons = ref({})
function onSendEmote(key) {
  sendEmote(key)
  showEmotePicker.value = false
}
watch(lastEmoteEvent, (evt) => {
  if (!evt) return
  const icon = myOrbitEmoteIcon(evt.emoteKey)
  if (!icon) return
  const id = evt.id
  emoteIcons.value = { ...emoteIcons.value, [evt.userId]: { icon, id } }
  setTimeout(() => {
    if (emoteIcons.value[evt.userId]?.id !== id) return
    const next = { ...emoteIcons.value }
    delete next[evt.userId]
    emoteIcons.value = next
  }, 1800)
})
watch(currentRoomId, () => { emoteIcons.value = {}; showEmotePicker.value = false })

// ── Room ambience — a looping track per room (MyOrbitRoom.ambientSoundPath), gated by the same
// "Mute sounds" setting every other audio in the game respects. useBattleMusic() is NOT a
// module-scoped singleton (see its own header comment) — this instance is fully independent of
// any cMoon battle music that might also be playing elsewhere in the app.
const ambience = useBattleMusic()
const { enabled: soundsEnabled } = useHapticSoundsPref()
// Tracked separately from roomState itself: `roomState` is reassigned to a brand-new object on
// every participantJoined/Left/Moved broadcast (composables/useMyOrbitSocket.js's
// mergeParticipants) — sent as often as every STEP_MS=350ms while anyone in the room is walking.
// Watching a getter that returns a freshly-allocated array/object on each run re-fires on EVERY
// one of those, and ambience.start() unconditionally restarts playback from 0 — this guard is
// what actually stops the track from audibly stuttering on every move tick, independent of
// exactly how often the watchers below end up re-running.
let ambiencePlayingPath = null
function syncAmbience() {
  const path = roomState.value?.id && soundsEnabled.value ? roomState.value?.ambientSoundPath : null
  if (path === ambiencePlayingPath) return
  if (path) ambience.start(path)
  else ambience.stop()
  ambiencePlayingPath = path
}
watch(() => roomState.value?.id, syncAmbience)
watch(() => roomState.value?.ambientSoundPath, syncAmbience)
watch(soundsEnabled, syncAmbience)
onBeforeUnmount(() => ambience.stop())

// ── Maximize (fills the viewport, like maximizing a desktop window) ─────────────────────────
const maximized = ref(false)

// ── Drag-to-reposition (pointer events cover both mouse and touch) ──────────────────────────
const windowEl = ref(null)
const dragPos = ref(null) // null until the user actually drags once — before that, default CSS corner anchor applies
let dragStartX = 0, dragStartY = 0, dragOriginLeft = 0, dragOriginTop = 0, dragging = false
// While maximized, .mow-window-maximized's own CSS (inset: 12px) positions the window — an
// inline left/top from a PRIOR drag would otherwise win (inline style beats a class rule), so
// this is skipped entirely whenever maximized, not just left at its last dragged value.
const dragStyle = computed(() => (!maximized.value && dragPos.value) ? { left: dragPos.value.x + 'px', top: dragPos.value.y + 'px', right: 'auto', bottom: 'auto' } : {})
function onHeaderPointerDown(e) {
  if (!windowEl.value || maximized.value) return
  dragging = true
  const rect = windowEl.value.getBoundingClientRect()
  dragStartX = e.clientX; dragStartY = e.clientY
  dragOriginLeft = rect.left; dragOriginTop = rect.top
  window.addEventListener('pointermove', onHeaderPointerMove)
  window.addEventListener('pointerup', onHeaderPointerUp)
}
function onHeaderPointerMove(e) {
  if (!dragging) return
  dragPos.value = { x: dragOriginLeft + (e.clientX - dragStartX), y: dragOriginTop + (e.clientY - dragStartY) }
}
function onHeaderPointerUp() {
  dragging = false
  window.removeEventListener('pointermove', onHeaderPointerMove)
  window.removeEventListener('pointerup', onHeaderPointerUp)
}
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onHeaderPointerMove)
  window.removeEventListener('pointerup', onHeaderPointerUp)
})
</script>

<style scoped>
.mow-launcher {
  position: fixed;
  left: 12px;
  bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  z-index: 40;
  background: #0d2a4d;
  color: #fff;
  border: 2px solid var(--OrbitDarkBlue, #1a4a7a);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
}
.mow-window {
  position: fixed;
  left: 12px;
  bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  /* Above the "Daily" onboarding pill (components/Onboarding.vue's own .ob-root, Tailwind
     z-50) — on a narrow phone this window's own width reaches well into its corner, and at a
     lower z-index Daily's pill/panel was painting over this window's bottom edge, covering the
     chat send button entirely. A window the player just opened should win that fight. */
  z-index: 55;
  width: 360px;
  max-width: calc(100vw - 24px);
  background: #0d2a4d;
  border: 2px solid var(--OrbitDarkBlue, #1a4a7a);
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* Maximize — fills the viewport (minus a small margin) like maximizing a desktop window, same
   on mobile as on PC. Positioning overrides the default corner anchor; dragStyle itself skips
   emitting an inline left/top while maximized so there's nothing of higher specificity to fight
   this rule. */
.mow-window-maximized {
  left: 12px;
  right: 12px;
  top: calc(12px + env(safe-area-inset-top, 0px));
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  width: auto;
  max-width: none;
  height: auto;
}
.mow-window-maximized .mow-header { cursor: default; }
.mow-window-maximized .mow-body { flex: 1; max-height: none; min-height: 0; }
.mow-window-maximized .mow-room { flex: 1; min-height: 0; }
.mow-window-maximized .mow-stage-wrap { flex: 1; max-height: none; min-height: 0; }
.mow-window-maximized .mow-chat-log { max-height: none; flex: 1; }
.mow-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: linear-gradient(135deg, #1a4a7a, #0a1f3a);
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.mow-title { color: #fff; font-weight: 700; font-size: 13px; }
.mow-header-btns { display: flex; gap: 4px; }
.mow-header-btn {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  border: none;
  font-size: 12px;
  cursor: pointer;
}
/* Explicit dark text color, not just a white background: this layout's global default
   (layouts/newsite-template.vue's --text-color) is WHITE, meant for its own dark page
   background — every element below that doesn't set its own color was inheriting that and
   rendering invisible white-on-white text against this panel's white background. */
.mow-body { background: #fff; color: #0f172a; display: flex; flex-direction: column; max-height: 70vh; }
.mow-error { color: #b91c1c; font-size: 11px; padding: 6px 10px 0; margin: 0; }
.mow-rooms { padding: 10px; overflow-y: auto; }
.mow-section-label { font-size: 11px; font-weight: 700; color: #334155; margin: 6px 0 4px; }
.mow-hint { font-size: 11px; color: #64748b; margin: 0 0 6px; }
.mow-avatar-strip { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.mow-avatar-thumb {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 6px;
  border: 2px solid #e2e8f0;
  background: #f8fafc;
  padding: 2px;
  cursor: pointer;
}
.mow-avatar-thumb img { width: 100%; height: 100%; object-fit: contain; }
.mow-avatar-thumb-selected { border-color: #2563eb; }
.mow-room-list { display: flex; flex-direction: column; gap: 4px; }
.mow-room-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 10px;
  border-radius: 6px;
  background: #f1f5f9;
  border: none;
  cursor: pointer;
  font-size: 12px;
}
.mow-room-row:disabled { opacity: 0.5; cursor: not-allowed; }
.mow-room-name { font-weight: 600; }
.mow-room-size { color: #64748b; font-size: 11px; }
.mow-room-theme-icon { width: 14px; height: 14px; object-fit: contain; border-radius: 999px; flex-shrink: 0; }
.mow-home-turf-badge, .mow-raid-den-badge { font-size: 10px; flex-shrink: 0; }

/* "Squad up" invite banner — one-shot, dismissible, shown regardless of room list vs. in-room view. */
.mow-invite-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 6px 10px 0;
  padding: 6px 8px;
  background: #fef3c7;
  border: 1px solid #fbbf24;
  border-radius: 6px;
  font-size: 11px;
  color: #78350f;
}
.mow-invite-banner-btns { display: flex; gap: 4px; flex-shrink: 0; }
.mow-invite-join-btn {
  padding: 3px 9px;
  border-radius: 999px;
  border: none;
  background: #d97706;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.mow-invite-dismiss-btn {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: none;
  background: rgba(0, 0, 0, 0.1);
  font-size: 11px;
  cursor: pointer;
}
/* Invite-to-raid action on another player's avatar — re-enables pointer events since the whole
   token (.mow-avatar-token) deliberately sets pointer-events: none for the glide, see its own
   comment. */
.mow-invite-btn {
  position: absolute;
  left: -3px;
  bottom: 6px;
  width: 15px;
  height: 15px;
  border-radius: 999px;
  border: none;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  font-size: 9px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto;
}

.mow-room { display: flex; flex-direction: column; }
.mow-room-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid #e2e8f0;
}
.mow-room-title { font-weight: 700; font-size: 12px; display: flex; align-items: center; gap: 4px; }
/* Raid Den — live spectator HP bar + round summary, shown above the stage while in a room
   flagged MyOrbitRoom.isRaidDen (see pollActiveRaid/syncRaidDenPolling). */
.mow-raid-den { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; background: #fff7ed; }
.mow-raid-den-head { display: flex; align-items: center; gap: 8px; }
.mow-raid-den-portrait { width: 32px; height: 32px; object-fit: contain; flex-shrink: 0; }
.mow-raid-den-info { flex: 1; min-width: 0; }
.mow-raid-den-name { font-size: 11px; font-weight: 700; color: #7c2d12; }
.mow-raid-den-hpbar { height: 6px; border-radius: 999px; background: #fed7aa; overflow: hidden; margin-top: 2px; }
.mow-raid-den-hpfill { height: 100%; background: #dc2626; transition: width 0.4s ease-out; }
.mow-raid-den-log { font-size: 10px; color: #78350f; margin: 4px 0 0; }
.mow-raid-den-idle { font-size: 11px; color: #92400e; margin: 0; }
.mow-leave-btn {
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid #fca5a5;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 11px;
  cursor: pointer;
}
.mow-stage-wrap { overflow: auto; max-height: 260px; background: #e2e8f0; }
.mow-stage { position: relative; }
.mow-layer-img { position: absolute; pointer-events: none; }
.mow-cell-hit { position: absolute; background: transparent; border: none; cursor: pointer; }
.mow-avatar-token {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 32px;
  pointer-events: none;
  /* The glide: every position change the server broadcasts lands here as a plain left/top
     change, and this transition is the entire animation — no per-frame JS. */
  transition: left 0.3s linear, top 0.3s linear;
}
.mow-avatar-img-wrap { position: relative; }
.mow-avatar-img {
  width: 28px; height: 28px; object-fit: contain; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.4));
  /* A continuous idle "breathing" bob so a standing avatar never reads as a dead, static image —
     same convention CMoonBattlePopupHost.vue's own portrait breathe animation already follows. */
  animation: mow-idle-bob 2.4s ease-in-out infinite;
}
.mow-avatar-token-me .mow-avatar-img { filter: drop-shadow(0 0 4px #facc15) drop-shadow(0 2px 2px rgba(0,0,0,0.4)); }
@keyframes mow-idle-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
/* A brief, punchier bounce the instant a glide settles (see onAvatarTransitionEnd) — overrides
   the idle bob for its own short duration, then idle bob simply resumes once the class is gone. */
.mow-avatar-landed .mow-avatar-img { animation: mow-avatar-land-bounce 0.26s ease-out; }
@keyframes mow-avatar-land-bounce {
  0% { transform: scale(1, 1) translateY(-3px); }
  50% { transform: scale(1.15, 0.85) translateY(0); }
  100% { transform: scale(1, 1) translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .mow-avatar-img { animation: none; }
  .mow-avatar-landed .mow-avatar-img { animation: none; }
}
/* Status flair — a small badge overlaid on the avatar image's own corner, never the avatar's own
   footprint (see .mow-avatar-img-wrap, which gives these an absolute-positioning anchor that's
   just the image, not the whole token including its name label below). */
.mow-flair {
  position: absolute;
  width: 13px;
  height: 13px;
  border-radius: 999px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  line-height: 1;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
.mow-flair-cmoon { right: -3px; bottom: 6px; border: 1.5px solid #64748b; }
.mow-flair-cmoon img { width: 100%; height: 100%; object-fit: cover; }
.mow-flair-admin { left: -3px; top: -4px; }
/* Emote pop — a transient, bigger icon than a flair badge, floating up off the avatar's corner
   and fading out. Offset away from .mow-speech-bubble (which sits directly above the token) so
   chatting and emoting at the same time don't visually collide. */
.mow-emote-pop {
  position: absolute;
  top: -10px;
  right: -8px;
  font-size: 18px;
  line-height: 1;
  pointer-events: none;
  animation: mow-emote-pop-kf 1.8s ease-out forwards;
}
@keyframes mow-emote-pop-kf {
  0% { transform: translateY(4px) scale(0.6); opacity: 0; }
  15% { transform: translateY(-2px) scale(1.15); opacity: 1; }
  30% { transform: translateY(-4px) scale(1); opacity: 1; }
  100% { transform: translateY(-22px) scale(1); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .mow-emote-pop { animation: none; opacity: 0; }
}
.mow-avatar-name {
  font-size: 9px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  padding: 0 4px;
  border-radius: 4px;
  white-space: nowrap;
  max-width: 70px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mow-speech-bubble {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: #fff;
  color: #0f172a;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 3px 7px;
  font-size: 10px;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}
.mow-chat { border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; }
.mow-chat-log { max-height: 110px; overflow-y: auto; padding: 6px 10px; }
.mow-chat-line { font-size: 11px; margin: 0 0 3px; word-break: break-word; }
.mow-emote-picker { display: flex; gap: 2px; padding: 4px 10px; border-top: 1px solid #f1f5f9; flex-wrap: wrap; }
.mow-emote-btn {
  width: 30px; height: 30px; border-radius: 6px; border: none; background: #f1f5f9;
  font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.mow-emote-btn:hover { background: #e2e8f0; }
.mow-chat-form { display: flex; gap: 6px; padding: 6px 10px; border-top: 1px solid #f1f5f9; }
.mow-emote-toggle {
  flex-shrink: 0; width: 30px; height: 30px; border-radius: 6px; border: 1px solid #cbd5e1;
  background: #fff; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.mow-chat-input { flex: 1; min-width: 0; border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 8px; font-size: 12px; }
.mow-chat-send {
  padding: 5px 12px;
  border-radius: 6px;
  border: none;
  background: #2563eb;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.mow-chat-send:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
