<template>
  <div class="admin-czone-fx bg-gray-50 text-xs" style="color-scheme: light;">
    <div class="px-2 py-2 space-y-4">
      <h1 class="text-base font-semibold">Manage cZone Effects</h1>
      <p class="text-gray-600">
        Build customizable cZone border/glow visuals — color, thickness, glow radius, transparency,
        and pulse speed. Assign one to a cMoon affinity level's border/glow slot from the
        <NuxtLink to="/newsite/admin/cMoon" class="text-indigo-600 hover:underline">cMoons</NuxtLink> page.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- List -->
      <div class="space-y-2">
        <div v-for="e in effects" :key="e.id" class="bg-white rounded border p-3 flex items-center gap-3 flex-wrap">
          <div class="w-20 h-14 rounded flex-shrink-0 czfx-preview-wrap">
            <div class="czfx-frame" :class="e.kind === 'BORDER' ? 'czfx-frame--bordered' : 'czfx-frame--glowing'" :style="previewStyle(e)"></div>
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-semibold break-words">{{ e.name }}</div>
            <div class="text-[11px] text-gray-600 break-words">
              {{ e.kind === 'BORDER' ? 'Border' : 'Glow' }} · {{ e.color }} · thickness {{ e.thickness }}px
              <template v-if="e.kind === 'GLOW'"> · radius {{ e.glowRadius }}px · {{ e.speed }}s cycle</template>
              · opacity {{ e.opacity }}
            </div>
            <div class="text-[11px] text-gray-600">{{ usageSummary(e) }}</div>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <button type="button" class="text-indigo-600 hover:underline" @click="startEdit(e)">Edit</button>
            <button
              type="button" class="text-red-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="isInUse(e) || deletingId === e.id"
              :title="deleteBlockedReason(e)"
              @click="remove(e)"
            >{{ deletingId === e.id ? 'Deleting…' : 'Delete' }}</button>
          </div>
        </div>
        <p v-if="!loading && !effects.length" class="text-gray-500">No cZone effects yet.</p>
      </div>

      <!-- Create / edit form -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">{{ editId ? 'Edit cZone effect' : 'New cZone effect' }}</h2>
        <p v-if="formError" class="text-red-600">{{ formError }}</p>

        <div>
          <label class="block text-xs font-medium mb-1">Name</label>
          <input v-model="form.name" maxlength="60" class="w-full border rounded px-2 py-1" placeholder="e.g. Radiant Gold Aura" />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Kind</label>
          <select v-model="form.kind" class="w-full border rounded px-2 py-1" :disabled="!!editId">
            <option value="BORDER">Border (static)</option>
            <option value="GLOW">Glow (animated)</option>
          </select>
          <p v-if="editId" class="text-[11px] text-gray-500 mt-1">Kind can't change after creation — create a new effect instead.</p>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Color</label>
          <div class="flex items-center gap-2">
            <input v-model="form.color" class="w-full min-w-0 border rounded px-2 py-1" placeholder="#f5b731" autocapitalize="none" autocorrect="off" spellcheck="false" />
            <input v-model="colorPicker" type="color" class="w-11 h-11 flex-shrink-0 border rounded p-0.5" aria-label="Pick color" />
          </div>
          <p v-if="form.color && !isSafeCMoonColor(form.color)" class="text-[11px] text-red-600 mt-1">Must be a hex color like #f5b731</p>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Thickness ({{ form.thickness }}px)</label>
          <input v-model.number="form.thickness" type="range" :min="THICKNESS_MIN" :max="THICKNESS_MAX" step="1" class="w-full" />
        </div>

        <div v-if="form.kind === 'GLOW'">
          <label class="block text-xs font-medium mb-1">Glow radius ({{ form.glowRadius }}px)</label>
          <input v-model.number="form.glowRadius" type="range" :min="GLOW_RADIUS_MIN" :max="GLOW_RADIUS_MAX" step="1" class="w-full" />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Opacity ({{ form.opacity }})</label>
          <input v-model.number="form.opacity" type="range" :min="OPACITY_MIN" :max="OPACITY_MAX" step="0.05" class="w-full" />
        </div>

        <div v-if="form.kind === 'GLOW'">
          <label class="block text-xs font-medium mb-1">Pulse speed ({{ form.speed }}s per cycle — lower is faster)</label>
          <input v-model.number="form.speed" type="range" :min="SPEED_MIN" :max="SPEED_MAX" step="0.1" class="w-full" />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Live preview</label>
          <div class="czfx-preview-wrap czfx-preview-wrap--large">
            <div class="czfx-frame" :class="form.kind === 'BORDER' ? 'czfx-frame--bordered' : 'czfx-frame--glowing'" :style="formPreviewStyle">
              <div class="czfx-topbar">OWNER PreviewUser</div>
              <div class="czfx-canvas"></div>
              <div class="czfx-bottombar"></div>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3 flex-wrap pt-1">
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="saving" @click="save"
          >{{ saving ? 'Saving…' : (editId ? 'Save changes' : 'Create effect') }}</button>
          <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="resetForm">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { isSafeCMoonColor, lightenHex } from '~/utils/cmoonColor'

// Keep these bounds in sync with server/utils/czoneEffect.js — see that file's comment for why
// THICKNESS_MAX/GLOW_RADIUS_MAX are capped well below what "looks epic in isolation" might
// suggest (the topbar/bottombar's own fixed heights).
const THICKNESS_MIN = 1
const THICKNESS_MAX = 14
const GLOW_RADIUS_MIN = 0
const GLOW_RADIUS_MAX = 30
const OPACITY_MIN = 0.1
const OPACITY_MAX = 1
const SPEED_MIN = 0.6
const SPEED_MAX = 10

const effects = ref([])
const loading = ref(false)
const loadError = ref('')

const editId = ref('')
const saving = ref(false)
const formError = ref('')
const deletingId = ref('')

const emptyForm = () => ({
  name: '', kind: 'BORDER', color: '#f5b731',
  thickness: 10, glowRadius: 18, opacity: 1, speed: 2.4,
})
const form = reactive(emptyForm())

const colorPicker = computed({
  get: () => (isSafeCMoonColor(form.color) ? form.color : '#f5b731'),
  set: (v) => { form.color = v },
})

// Mirrors czFrameCosmeticStyle in components/newsite/MyCzone.vue — keep the two in sync if either
// changes. Kept separate (not a shared import) since Vue's <style scoped> can't be shared across
// components; see this file's CSS block below for the matching duplicated rules.
function effectFrameStyle(e) {
  const lightColor = isSafeCMoonColor(e.color) ? lightenHex(e.color, 0.55) : '#ffffff'
  if (e.kind === 'BORDER') {
    return {
      '--czfx-border-color': e.color,
      '--czfx-border-color-light': lightColor,
      '--czfx-border-thickness': `${e.thickness}px`,
      '--czfx-border-opacity': e.opacity,
    }
  }
  return {
    '--czfx-glow-color': e.color,
    '--czfx-glow-color-light': lightColor,
    '--czfx-glow-thickness': `${e.thickness}px`,
    '--czfx-glow-radius': `${e.glowRadius}px`,
    '--czfx-glow-opacity': e.opacity,
    '--czfx-glow-speed': `${e.speed}s`,
  }
}

function previewStyle(e) { return effectFrameStyle(e) }
const formPreviewStyle = computed(() => effectFrameStyle(form))

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/czone-effects')
    effects.value = res?.effects || []
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load cZone effects'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  editId.value = ''
  formError.value = ''
  Object.assign(form, emptyForm())
}

function startEdit(e) {
  editId.value = e.id
  formError.value = ''
  Object.assign(form, {
    name: e.name,
    kind: e.kind,
    color: e.color,
    thickness: e.thickness,
    glowRadius: e.glowRadius,
    opacity: e.opacity,
    speed: e.speed,
  })
}

async function save() {
  formError.value = ''
  if (!form.name.trim()) { formError.value = 'Name is required.'; return }
  if (!isSafeCMoonColor(form.color)) { formError.value = 'Color must be a hex value like #f5b731'; return }

  saving.value = true
  try {
    const body = {
      name: form.name.trim(),
      kind: form.kind,
      color: form.color,
      thickness: Math.round(form.thickness),
      glowRadius: Math.round(form.glowRadius),
      opacity: form.opacity,
      speed: form.speed,
    }
    if (editId.value) {
      await $fetch(`/api/admin/czone-effects/${editId.value}`, { method: 'PUT', body })
    } else {
      const res = await $fetch('/api/admin/czone-effects', { method: 'POST', body })
      editId.value = res.id
    }
    await load()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to save cZone effect'
  } finally {
    saving.value = false
  }
}

function usageSummary(e) {
  const parts = [`Assigned to ${e.assignedCount} affinity level${e.assignedCount === 1 ? '' : 's'}`]
  if (e.grantedCount) parts.push(`granted to ${e.grantedCount} player${e.grantedCount === 1 ? '' : 's'} (permanent — can't be undone)`)
  return parts.join(', ')
}
function isInUse(e) { return e.assignedCount > 0 || e.grantedCount > 0 }
function deleteBlockedReason(e) {
  if (e.grantedCount > 0) return "Already granted to a player — can't be deleted"
  if (e.assignedCount > 0) return 'Unassign every affinity level using this effect first'
  return ''
}

async function remove(e) {
  if (isInUse(e)) return
  if (!confirm(`Delete "${e.name}"? This can't be undone.`)) return
  deletingId.value = e.id
  try {
    await $fetch(`/api/admin/czone-effects/${e.id}`, { method: 'DELETE' })
    if (editId.value === e.id) resetForm()
    await load()
  } catch (err) {
    loadError.value = err?.data?.statusMessage || 'Failed to delete cZone effect'
  } finally {
    deletingId.value = ''
  }
}

onMounted(load)
</script>

<style scoped>
/* Mirrors .cz-frame's cosmetic rules in components/newsite/MyCzone.vue (own --czfx-* custom
   property namespace here to avoid any collision with the real page's --cz-* ones, since an admin
   could conceivably have this page and a cZone open in the same tab via an iframe/preview in the
   future) — keep both in sync if either changes. See that file's CSS for the full design rationale. */
.czfx-preview-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  background: #3399CC;
}
.czfx-preview-wrap--large {
  width: 100%;
  max-width: 320px;
  height: 200px;
}
.czfx-frame {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: inherit;
  overflow: hidden;
}
.czfx-topbar { height: 28%; background: #3399CC; border-bottom: 2px solid #336699; flex-shrink: 0; display: flex; align-items: center; padding: 0 8px; color: #fff; font-size: 10px; font-weight: 600; }
.czfx-canvas { flex: 1; background: repeating-linear-gradient(45deg, #001a33, #001a33 8px, #00223f 8px, #00223f 16px); }
.czfx-bottombar { height: 12%; background: #336699; flex-shrink: 0; }

.czfx-frame--bordered::after,
.czfx-frame--glowing::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}
.czfx-frame--bordered::after {
  box-shadow:
    inset 0 0 0 var(--czfx-border-thickness, 10px) var(--czfx-border-color, transparent),
    inset 0 0 0 calc(var(--czfx-border-thickness, 10px) + 3px) var(--czfx-border-color-light, transparent),
    inset 0 0 14px 2px rgba(0, 0, 0, 0.35);
  opacity: var(--czfx-border-opacity, 1);
}
.czfx-frame--glowing::after {
  animation: czfx-glow-pulse var(--czfx-glow-speed, 2.4s) ease-in-out infinite;
  opacity: var(--czfx-glow-opacity, 1);
}
@keyframes czfx-glow-pulse {
  0%, 100% {
    box-shadow:
      inset 0 0 0 var(--czfx-glow-thickness, 6px) var(--czfx-glow-color, #fff),
      inset 0 0 0 calc(var(--czfx-glow-thickness, 6px) + 2px) var(--czfx-glow-color-light, #fff),
      inset 0 0 calc(var(--czfx-glow-radius, 16px) * 0.7) calc(var(--czfx-glow-radius, 16px) * 0.35) var(--czfx-glow-color, #fff);
    filter: brightness(1);
  }
  50% {
    box-shadow:
      inset 0 0 0 calc(var(--czfx-glow-thickness, 6px) + 3px) var(--czfx-glow-color, #fff),
      inset 0 0 0 calc(var(--czfx-glow-thickness, 6px) + 6px) var(--czfx-glow-color-light, #fff),
      inset 0 0 var(--czfx-glow-radius, 16px) calc(var(--czfx-glow-radius, 16px) * 0.65) var(--czfx-glow-color, #fff);
    filter: brightness(1.35);
  }
}
@media (prefers-reduced-motion: reduce) {
  .czfx-frame--glowing::after {
    animation: none;
    filter: brightness(1.15);
    box-shadow:
      inset 0 0 0 calc(var(--czfx-glow-thickness, 6px) + 2px) var(--czfx-glow-color, #fff),
      inset 0 0 0 calc(var(--czfx-glow-thickness, 6px) + 5px) var(--czfx-glow-color-light, #fff),
      inset 0 0 calc(var(--czfx-glow-radius, 16px) * 0.85) calc(var(--czfx-glow-radius, 16px) * 0.5) var(--czfx-glow-color, #fff);
  }
}
</style>
