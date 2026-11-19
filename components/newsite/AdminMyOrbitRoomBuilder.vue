<template>
  <div class="admin-myorbit-rooms bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-semibold">MyOrbit Rooms</h1>
      </div>
      <p class="text-gray-500">
        Build the isometric chatrooms players walk around in. Paint floor tiles first, then place
        furniture on top — furniture can only stand on a cell that already has a floor tile
        painted and saved. Add tiles/furniture art under <strong>MyOrbit Tiles</strong> and
        <strong>MyOrbit Furniture</strong> first.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- ── Master on/off switch ──────────────────────────────────── -->
      <div class="bg-white border rounded p-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" :checked="myOrbitEnabled" :disabled="savingEnabled" @change="toggleEnabled($event.target.checked)" />
          <span class="font-semibold text-sm">MyOrbit is {{ myOrbitEnabled ? 'enabled' : 'disabled' }} site-wide</span>
        </label>
        <p class="text-gray-500 mt-1">Players can't join any room while this is off. Doesn't kick anyone already in one.</p>
        <p v-if="enabledError" class="text-red-600">{{ enabledError }}</p>
      </div>

      <!-- ── Room list ──────────────────────────────────────────────── -->
      <div class="bg-white border rounded p-3 space-y-2">
        <h2 class="font-semibold text-sm">Rooms</h2>
        <div v-if="rooms.length" class="space-y-1">
          <button
            v-for="r in rooms" :key="r.id" type="button"
            class="w-full text-left flex items-center gap-2 text-[11px] bg-gray-50 rounded px-2 py-1 hover:bg-gray-100"
            :class="selectedId === r.id ? 'ring-2 ring-blue-500' : ''"
            @click="selectRoom(r)"
          >
            <span class="flex-1 min-w-0 break-words font-semibold">{{ r.name }}</span>
            <span class="text-gray-500 flex-shrink-0">{{ r.gridWidth }}x{{ r.gridHeight }}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] flex-shrink-0" :class="r.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'">
              {{ r.active ? 'Active' : 'Inactive' }}
            </span>
            <span v-if="r.isRaidDen" class="px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 bg-amber-100 text-amber-700" title="Live raid spectating">Raid Den</span>
            <span v-if="r.themeCMoonId" class="px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 bg-purple-100 text-purple-700">{{ cmoonNameById(r.themeCMoonId) }}</span>
            <span class="text-gray-500 flex-shrink-0">{{ r.tileCount }} tiles · {{ r.furnitureCount }} furniture</span>
          </button>
        </div>
        <p v-else class="text-gray-500">No rooms yet.</p>
        <button
          type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
          @click="newRoom"
        >+ New room</button>
      </div>

      <!-- ── Room metadata form ────────────────────────────────────── -->
      <div v-if="form" class="bg-white border rounded p-3 space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="font-semibold text-sm">{{ selectedId ? 'Edit room' : 'New room' }}</h2>
          <button
            v-if="selectedId" type="button"
            class="text-red-600 hover:underline text-[11px]" :disabled="deleting" @click="deleteRoom"
          >{{ deleting ? 'Deleting…' : 'Delete room' }}</button>
        </div>
        <p v-if="formError" class="text-red-600">{{ formError }}</p>

        <div class="flex gap-2 flex-wrap items-end">
          <div class="w-48">
            <label class="block text-[11px] font-medium mb-1">Name</label>
            <input v-model="form.name" maxlength="80" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="w-24">
            <label class="block text-[11px] font-medium mb-1">Grid W (3-30)</label>
            <input v-model.number="form.gridWidth" type="number" min="3" max="30" class="w-full border rounded px-2 py-1" :disabled="!!selectedId" />
          </div>
          <div class="w-24">
            <label class="block text-[11px] font-medium mb-1">Grid H (3-30)</label>
            <input v-model.number="form.gridHeight" type="number" min="3" max="30" class="w-full border rounded px-2 py-1" :disabled="!!selectedId" />
          </div>
          <div class="w-24">
            <label class="block text-[11px] font-medium mb-1">Capacity</label>
            <input v-model.number="form.capacity" type="number" min="1" max="100" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="w-24">
            <label class="block text-[11px] font-medium mb-1">Sort order</label>
            <input v-model.number="form.sortOrder" type="number" min="-9999" max="9999" class="w-full border rounded px-2 py-1" />
          </div>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="form.active" />
            <span class="text-[11px] font-medium">Active</span>
          </label>
          <div class="w-44">
            <label class="block text-[11px] font-medium mb-1">Faction theme (optional)</label>
            <select v-model="form.themeCMoonId" class="w-full border rounded px-2 py-1">
              <option :value="null">None</option>
              <option v-for="c in cmoonOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="form.isRaidDen" />
            <span class="text-[11px] font-medium" title="Shows a live HP bar for whatever raid boss fight is currently in progress, for spectating.">Raid Den</span>
          </label>
        </div>
        <p v-if="selectedId" class="text-[11px] text-gray-500">
          Grid size can't be changed once a room exists — delete and recreate it to resize (this
          would orphan any painted cells/furniture outside the new bounds).
        </p>

        <div v-if="selectedId" class="border rounded p-2 space-y-1">
          <label class="block text-[11px] font-medium">Ambience (optional, MP3/OGG/WAV, max 3MB) — loops while a player is in this room</label>
          <div class="flex items-center gap-2 flex-wrap">
            <audio v-if="ambientSound.savedPath" :src="ambientSound.savedPath" controls class="h-8 flex-shrink-0" style="max-width: 220px;" />
            <span v-else class="text-[10px] text-gray-400 flex-shrink-0">No ambience set</span>
            <button
              v-if="ambientSound.savedPath" type="button" class="text-red-600 hover:underline text-[11px]"
              @click="removeAmbientSound"
            >Remove</button>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <input type="file" accept="audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav" class="text-[11px]" @change="onAmbientSoundFile" />
            <button
              type="button" class="px-2 py-1 text-[11px] font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="!ambientSound.pendingFile || ambientSound.uploading" @click="uploadAmbientSound"
            >{{ ambientSound.uploading ? 'Uploading…' : 'Upload' }}</button>
          </div>
          <p v-if="ambientSound.error" class="text-red-600">{{ ambientSound.error }}</p>
        </div>

        <button
          type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="savingMeta" @click="saveRoomMeta"
        >{{ savingMeta ? 'Saving…' : (selectedId ? 'Save room details' : 'Create room') }}</button>
      </div>

      <!-- ── Builder canvas ─────────────────────────────────────────── -->
      <div v-if="selectedId && form" class="bg-white border rounded p-3 space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="font-semibold text-sm">Layout</h2>
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            :disabled="savingLayout" @click="saveLayout"
          >{{ savingLayout ? 'Saving…' : 'Save layout' }}</button>
        </div>
        <p v-if="layoutError" class="text-red-600">{{ layoutError }}</p>
        <p v-if="layoutStatus" class="text-green-700">{{ layoutStatus }}</p>

        <div class="flex gap-4 flex-wrap">
          <!-- Tile palette -->
          <div class="space-y-1">
            <h3 class="font-semibold text-[11px]">Tiles (click, then click a cell to paint)</h3>
            <div class="flex gap-1 flex-wrap max-w-xs">
              <button
                type="button"
                class="w-10 h-10 border rounded flex items-center justify-center bg-red-50"
                :class="paintTool === 'erase' ? 'ring-2 ring-red-500' : ''"
                title="Eraser" @click="selectEraser"
              >✕</button>
              <button
                v-for="t in tilesLibrary" :key="t.id" type="button"
                class="w-10 h-10 border rounded overflow-hidden"
                :class="paintTool === t.id ? 'ring-2 ring-blue-500' : ''"
                :title="t.name" @click="selectPaintTool(t)"
              >
                <img :src="t.assetPath" alt="" class="w-full h-full object-contain" />
              </button>
            </div>
          </div>

          <!-- Furniture palette -->
          <div class="space-y-1">
            <h3 class="font-semibold text-[11px]">Furniture (click, then click a cell to place)</h3>
            <div class="flex gap-1 flex-wrap max-w-xs">
              <button
                v-for="f in furnitureLibrary" :key="f.id" type="button"
                class="w-10 h-10 border rounded overflow-hidden"
                :class="furnitureTool === f.id ? 'ring-2 ring-blue-500' : ''"
                :title="f.name" @click="selectFurnitureTool(f)"
              >
                <img :src="f.assetPath" alt="" class="w-full h-full object-contain" />
              </button>
            </div>
            <div v-if="furnitureTool" class="flex items-center gap-2">
              <button type="button" class="px-2 py-1 border rounded text-[11px]" @click="rotateFurnitureTool">Rotate ({{ furnitureRotation }}°)</button>
            </div>
            <div v-if="selectedPlacementIndex !== null" class="flex items-center gap-2">
              <span class="text-[11px] text-gray-500">Furniture piece selected.</span>
              <button type="button" class="px-2 py-1 border rounded text-[11px] text-red-600" @click="removeSelectedPlacement">Remove it</button>
            </div>
          </div>
        </div>

        <!-- Isometric grid stage -->
        <div class="overflow-auto border rounded bg-gray-100" style="max-height: 70vh">
          <div class="relative" :style="{ width: stage.width + 'px', height: stage.height + 'px' }">
            <!-- Painted floor tiles (purely visual - pointer-events: none so clicks always reach the hit-target layer below) -->
            <img
              v-for="c in paintedCellList" :key="`floor-${c.x}-${c.y}`"
              :src="c.assetPath" alt=""
              class="absolute pointer-events-none"
              :style="{ left: c.left + 'px', top: c.top + 'px', width: TILE_WIDTH + 'px', height: TILE_HEIGHT + 'px', zIndex: c.z }"
            />
            <!-- Placed furniture (also purely visual) -->
            <img
              v-for="(p, i) in placementList" :key="`furn-${i}`"
              :src="p.assetPath" alt=""
              class="absolute pointer-events-none"
              :class="selectedPlacementIndex === i ? 'ring-4 ring-blue-400' : ''"
              :style="{ left: p.left + 'px', top: p.top + 'px', width: p.renderWidth + 'px', height: p.renderHeight + 'px', zIndex: p.z }"
            />
            <!-- Click hit-targets: one per grid cell, always on top, invisible but for a faint outline -->
            <button
              v-for="cell in gridCellTargets" :key="`hit-${cell.x}-${cell.y}`" type="button"
              class="absolute border border-gray-300/40 hover:border-blue-400"
              :style="{ left: cell.left + 'px', top: cell.top + 'px', width: TILE_WIDTH + 'px', height: TILE_HEIGHT + 'px', zIndex: 100000 + cell.x + cell.y }"
              @click="onCellClick(cell.x, cell.y)"
            ></button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  TILE_WIDTH, TILE_HEIGHT, MYORBIT_LAYER,
  gridStageSize, tileScreenPosition, depthIndex, effectiveFootprint, footprintFitsGrid, footprintsOverlap
} from '~/utils/myOrbitIsometric'

const rooms = ref([])
const loadError = ref('')
const myOrbitEnabled = ref(false)
const savingEnabled = ref(false)
const enabledError = ref('')
const selectedId = ref(null)
const form = ref(null)
const savingMeta = ref(false)
const deleting = ref(false)
const formError = ref('')

// Kept separate from `form` (not sent through the plain-JSON metadata PUT) since it's uploaded
// via its own multipart endpoint, same convention every other per-entity media path in this
// admin console follows (e.g. AdminCMoonEnemies.vue's faction/member sound slots).
const ambientSound = ref({ savedPath: '', pendingFile: null, uploading: false, error: '' })
const cmoonOptions = ref([])

const tilesLibrary = ref([])
const furnitureLibrary = ref([])

// cells: Map<"x,y", { tileId, assetPath, walkable }>
const cells = ref(new Map())
// placements: [{ furnitureId, x, y, rotation, assetPath, footprintW, footprintH, blocksWalk, zOffset }]
const placements = ref([])

const paintTool = ref(null) // 'erase' | tileId | null
const furnitureTool = ref(null) // furnitureId | null
const furnitureRotation = ref(0)
const selectedPlacementIndex = ref(null)

const savingLayout = ref(false)
const layoutError = ref('')
const layoutStatus = ref('')

function emptyForm() {
  return { name: '', gridWidth: 10, gridHeight: 10, capacity: 20, active: false, sortOrder: 0, themeCMoonId: null, isRaidDen: false }
}

const stage = computed(() => form.value ? gridStageSize(form.value.gridWidth, form.value.gridHeight) : { width: 0, height: 0, offsetX: 0, offsetY: 0 })

const gridCellTargets = computed(() => {
  if (!form.value) return []
  const out = []
  for (let y = 0; y < form.value.gridHeight; y++) {
    for (let x = 0; x < form.value.gridWidth; x++) {
      const pos = tileScreenPosition(x, y, stage.value)
      out.push({ x, y, left: pos.left, top: pos.top })
    }
  }
  return out
})

const paintedCellList = computed(() => {
  const out = []
  for (const [key, cell] of cells.value) {
    const [x, y] = key.split(',').map(Number)
    const pos = tileScreenPosition(x, y, stage.value)
    out.push({ x, y, left: pos.left, top: pos.top, assetPath: cell.assetPath, z: depthIndex(x, y, 1, 1, MYORBIT_LAYER.FLOOR) })
  }
  return out
})

const placementList = computed(() => placements.value.map(p => {
  const { width, height } = effectiveFootprint(p.footprintW, p.footprintH, p.rotation)
  const pos = tileScreenPosition(p.x, p.y, stage.value)
  return {
    ...p,
    left: pos.left,
    top: pos.top,
    renderWidth: width * TILE_WIDTH,
    renderHeight: height * TILE_HEIGHT,
    // zOffset NUDGES the stacking order (per MyOrbitFurniture.zOffset's own schema comment),
    // never a pixel position shift - it's added straight onto the computed depth.
    z: depthIndex(p.x, p.y, width, height, MYORBIT_LAYER.FURNITURE) + p.zOffset
  }
}))

async function loadLibraries() {
  try {
    const [tilesRes, furnRes, cmoonRes] = await Promise.all([
      $fetch('/api/admin/myorbit-tiles'),
      $fetch('/api/admin/myorbit-furniture'),
      $fetch('/api/admin/myorbit-rooms/cmoon-options')
    ])
    tilesLibrary.value = tilesRes?.tiles || []
    furnitureLibrary.value = furnRes?.furniture || []
    cmoonOptions.value = cmoonRes?.cmoons || []
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load tile/furniture libraries'
  }
}

function cmoonNameById(id) {
  return cmoonOptions.value.find(c => c.id === id)?.name || 'Faction'
}

async function loadRooms() {
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/myorbit-rooms')
    rooms.value = res?.rooms || []
    myOrbitEnabled.value = !!res?.myOrbitEnabled
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load rooms'
  }
}

async function toggleEnabled(next) {
  enabledError.value = ''
  savingEnabled.value = true
  try {
    const res = await $fetch('/api/admin/myorbit-settings', { method: 'POST', body: { myOrbitEnabled: next } })
    myOrbitEnabled.value = !!res?.myOrbitEnabled
  } catch (e) {
    enabledError.value = e?.data?.statusMessage || 'Failed to save'
  } finally {
    savingEnabled.value = false
  }
}

function resetLayoutState() {
  cells.value = new Map()
  placements.value = []
  paintTool.value = null
  furnitureTool.value = null
  furnitureRotation.value = 0
  selectedPlacementIndex.value = null
  layoutError.value = ''
  layoutStatus.value = ''
}

async function selectRoom(r) {
  formError.value = ''
  resetLayoutState()
  try {
    const full = await $fetch(`/api/admin/myorbit-rooms/${r.id}`)
    selectedId.value = full.id
    form.value = {
      name: full.name, gridWidth: full.gridWidth, gridHeight: full.gridHeight, capacity: full.capacity,
      active: full.active, sortOrder: full.sortOrder, themeCMoonId: full.themeCMoonId || null, isRaidDen: !!full.isRaidDen
    }
    ambientSound.value = { savedPath: full.ambientSoundPath || '', pendingFile: null, uploading: false, error: '' }
    for (const t of full.tiles) {
      cells.value.set(`${t.x},${t.y}`, { tileId: t.tileId, assetPath: t.assetPath, walkable: t.walkable })
    }
    placements.value = full.furniture.map(f => ({
      furnitureId: f.furnitureId, x: f.x, y: f.y, rotation: f.rotation,
      assetPath: f.assetPath, footprintW: f.footprintW, footprintH: f.footprintH,
      blocksWalk: f.blocksWalk, zOffset: f.zOffset
    }))
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load room'
  }
}

function newRoom() {
  selectedId.value = null
  formError.value = ''
  resetLayoutState()
  form.value = emptyForm()
  ambientSound.value = { savedPath: '', pendingFile: null, uploading: false, error: '' }
}

function onAmbientSoundFile(ev) {
  const f = ev.target.files?.[0] || null
  ambientSound.value.error = ''
  if (f && !/audio\/(mpeg|ogg|wav)/.test(f.type) && !/\.(mp3|ogg|wav)$/i.test(f.name)) {
    ambientSound.value.error = 'Only MP3, OGG, or WAV audio is allowed.'
    ev.target.value = ''
    return
  }
  if (f && f.size > 3 * 1024 * 1024) {
    ambientSound.value.error = 'Audio must be 3MB or smaller.'
    ev.target.value = ''
    return
  }
  ambientSound.value.pendingFile = f
}

async function uploadAmbientSound() {
  if (!ambientSound.value.pendingFile || !selectedId.value) return
  ambientSound.value.uploading = true
  ambientSound.value.error = ''
  try {
    const fd = new FormData()
    fd.append('audio', ambientSound.value.pendingFile)
    const res = await $fetch(`/api/admin/myorbit-rooms/${selectedId.value}/sound`, { method: 'POST', body: fd })
    ambientSound.value.savedPath = res.ambientSoundPath || ambientSound.value.savedPath
    ambientSound.value.pendingFile = null
  } catch (e) {
    ambientSound.value.error = e?.data?.statusMessage || 'Upload failed.'
  } finally {
    ambientSound.value.uploading = false
  }
}

async function removeAmbientSound() {
  if (!selectedId.value) return
  ambientSound.value.error = ''
  try {
    await $fetch(`/api/admin/myorbit-rooms/${selectedId.value}/sound`, { method: 'DELETE' })
    ambientSound.value.savedPath = ''
  } catch (e) {
    ambientSound.value.error = e?.data?.statusMessage || 'Failed to remove sound.'
  }
}

async function saveRoomMeta() {
  formError.value = ''
  savingMeta.value = true
  try {
    if (selectedId.value) {
      await $fetch(`/api/admin/myorbit-rooms/${selectedId.value}`, { method: 'PUT', body: { ...form.value } })
    } else {
      const res = await $fetch('/api/admin/myorbit-rooms', { method: 'POST', body: { ...form.value } })
      selectedId.value = res.id
    }
    await loadRooms()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to save room'
  } finally {
    savingMeta.value = false
  }
}

async function deleteRoom() {
  if (!selectedId.value) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/myorbit-rooms/${selectedId.value}`, { method: 'DELETE' })
    await loadRooms()
    selectedId.value = null
    form.value = null
    resetLayoutState()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to delete room'
  } finally {
    deleting.value = false
  }
}

function selectEraser() {
  paintTool.value = 'erase'
  furnitureTool.value = null
  selectedPlacementIndex.value = null
}

function selectPaintTool(t) {
  paintTool.value = t.id
  furnitureTool.value = null
  selectedPlacementIndex.value = null
}

function selectFurnitureTool(f) {
  furnitureTool.value = f.id
  furnitureRotation.value = 0
  paintTool.value = null
  selectedPlacementIndex.value = null
}

function rotateFurnitureTool() {
  furnitureRotation.value = (furnitureRotation.value + 90) % 360
}

function removeSelectedPlacement() {
  if (selectedPlacementIndex.value === null) return
  placements.value.splice(selectedPlacementIndex.value, 1)
  selectedPlacementIndex.value = null
}

function placementAt(x, y) {
  return placements.value.findIndex(p => {
    const { width, height } = effectiveFootprint(p.footprintW, p.footprintH, p.rotation)
    return x >= p.x && x < p.x + width && y >= p.y && y < p.y + height
  })
}

function onCellClick(x, y) {
  layoutError.value = ''
  layoutStatus.value = ''

  if (paintTool.value === 'erase') {
    // Block erasing a cell that a placed furniture piece is currently standing on - the two
    // batches save independently, so doing this would leave that furniture floating over void
    // until an admin notices and fixes it. Remove the furniture first (click it, then "Remove
    // it") if the floor underneath really needs to go.
    if (placementAt(x, y) >= 0) {
      layoutError.value = 'Remove the furniture on this cell before erasing its floor tile.'
      return
    }
    cells.value = new Map(cells.value)
    cells.value.delete(`${x},${y}`)
    return
  }

  if (paintTool.value) {
    const tile = tilesLibrary.value.find(t => t.id === paintTool.value)
    if (!tile) return
    cells.value = new Map(cells.value)
    cells.value.set(`${x},${y}`, { tileId: tile.id, assetPath: tile.assetPath, walkable: tile.walkable })
    return
  }

  if (furnitureTool.value) {
    const item = furnitureLibrary.value.find(f => f.id === furnitureTool.value)
    if (!item) return
    const { width, height } = effectiveFootprint(item.footprintW, item.footprintH, furnitureRotation.value)
    if (!footprintFitsGrid(x, y, width, height, form.value.gridWidth, form.value.gridHeight)) {
      layoutError.value = 'That placement does not fit inside the grid.'
      return
    }
    const candidate = { x, y, width, height }
    for (const p of placements.value) {
      const pf = effectiveFootprint(p.footprintW, p.footprintH, p.rotation)
      if (footprintsOverlap(candidate, { x: p.x, y: p.y, ...pf })) {
        layoutError.value = 'That overlaps another placed furniture piece.'
        return
      }
    }
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        if (!cells.value.has(`${x + dx},${y + dy}`)) {
          layoutError.value = `Paint the floor at (${x + dx}, ${y + dy}) before placing furniture there.`
          return
        }
      }
    }
    placements.value = [...placements.value, {
      furnitureId: item.id, x, y, rotation: furnitureRotation.value,
      assetPath: item.assetPath, footprintW: item.footprintW, footprintH: item.footprintH,
      blocksWalk: item.blocksWalk, zOffset: item.zOffset
    }]
    return
  }

  // Neither tool selected: clicking a placed furniture piece selects it for removal.
  const idx = placementAt(x, y)
  selectedPlacementIndex.value = idx >= 0 ? idx : null
}

async function saveLayout() {
  layoutError.value = ''
  layoutStatus.value = ''
  savingLayout.value = true
  try {
    const cellPayload = [...cells.value].map(([key, c]) => {
      const [x, y] = key.split(',').map(Number)
      return { x, y, tileId: c.tileId }
    })
    await $fetch(`/api/admin/myorbit-rooms/${selectedId.value}/tiles`, { method: 'PUT', body: { cells: cellPayload } })

    // footprintW/footprintH are NOT sent - the server looks them up itself from the real
    // MyOrbitFurniture library row by furnitureId, never trusting a client-supplied footprint
    // for its own fit/overlap validation.
    const placementPayload = placements.value.map(p => ({
      furnitureId: p.furnitureId, x: p.x, y: p.y, rotation: p.rotation
    }))
    await $fetch(`/api/admin/myorbit-rooms/${selectedId.value}/furniture`, { method: 'PUT', body: { placements: placementPayload } })

    layoutStatus.value = 'Saved.'
    await loadRooms()
  } catch (e) {
    layoutError.value = e?.data?.statusMessage || 'Failed to save layout'
  } finally {
    savingLayout.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadRooms(), loadLibraries()])
})
</script>
