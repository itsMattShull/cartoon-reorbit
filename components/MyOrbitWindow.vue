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
    <div v-else ref="windowEl" class="mow-window" :style="dragStyle">
      <div class="mow-header" @pointerdown="onHeaderPointerDown">
        <span class="mow-title">MyOrbit</span>
        <div class="mow-header-btns">
          <button type="button" class="mow-header-btn" title="Minimize" @click.stop="uiState = 'minimized'">–</button>
          <button type="button" class="mow-header-btn" title="Close" @click.stop="onClose">✕</button>
        </div>
      </div>

      <div class="mow-body">
        <p v-if="lastError" class="mow-error">{{ lastError }}</p>

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
              :disabled="!selectedCtoonId" @click="onJoin(r.id)"
            >
              <span class="mow-room-name">{{ r.name }}</span>
              <span class="mow-room-size">{{ r.gridWidth }}x{{ r.gridHeight }}</span>
            </button>
          </div>
        </div>

        <!-- ── In a room: isometric canvas + chat ────────────────────────────────────────── -->
        <div v-else class="mow-room">
          <div class="mow-room-toolbar">
            <span class="mow-room-title">{{ roomState?.name || 'Loading…' }}</span>
            <button type="button" class="mow-leave-btn" @click="onLeave">Leave</button>
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
                :class="p.isMe ? 'mow-avatar-token-me' : ''"
                :style="{ left: p.left + 'px', top: p.top + 'px', zIndex: p.z }"
              >
                <div v-if="bubbles[p.userId]" class="mow-speech-bubble">{{ bubbles[p.userId].text }}</div>
                <img :src="p.ctoonAssetPath" alt="" class="mow-avatar-img" />
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
            <form class="mow-chat-form" @submit.prevent="onSendChat">
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
import { useMyOrbitSocket } from '~/composables/useMyOrbitSocket'

const { user } = useAuth()
const {
  roomState, lastError, currentRoomId, chatMessages,
  joinRoom, leaveRoom, moveTo, sendChat
} = useMyOrbitSocket()

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
      isMe: p.userId === user.value?.id,
      left: pos.left + TILE_WIDTH / 4, top: pos.top - 28,
      z: depthIndex(p.x, p.y, 1, 1, MYORBIT_LAYER.AVATAR)
    }
  })
})

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

// ── Drag-to-reposition (pointer events cover both mouse and touch) ──────────────────────────
const windowEl = ref(null)
const dragPos = ref(null) // null until the user actually drags once — before that, default CSS corner anchor applies
let dragStartX = 0, dragStartY = 0, dragOriginLeft = 0, dragOriginTop = 0, dragging = false
const dragStyle = computed(() => dragPos.value ? { left: dragPos.value.x + 'px', top: dragPos.value.y + 'px', right: 'auto', bottom: 'auto' } : {})
function onHeaderPointerDown(e) {
  if (!windowEl.value) return
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
  z-index: 45;
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
.mow-body { background: #fff; display: flex; flex-direction: column; max-height: 70vh; }
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

.mow-room { display: flex; flex-direction: column; }
.mow-room-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid #e2e8f0;
}
.mow-room-title { font-weight: 700; font-size: 12px; }
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
.mow-avatar-img { width: 28px; height: 28px; object-fit: contain; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.4)); }
.mow-avatar-token-me .mow-avatar-img { filter: drop-shadow(0 0 4px #facc15) drop-shadow(0 2px 2px rgba(0,0,0,0.4)); }
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
.mow-chat-form { display: flex; gap: 6px; padding: 6px 10px; border-top: 1px solid #f1f5f9; }
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
