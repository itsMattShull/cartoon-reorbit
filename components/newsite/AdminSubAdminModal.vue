<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" :aria-label="title">
    <div class="absolute inset-0 bg-black/50" @click="onCancel"></div>

    <div class="relative bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-lg shadow-lg flex flex-col overflow-hidden text-sm">
      <!-- Header -->
      <div class="flex items-start gap-3 px-4 pt-4 pb-3 border-b">
        <div class="min-w-0">
          <h3 class="text-base font-semibold">{{ title }}</h3>
          <p class="mt-0.5 text-xs text-gray-600">
            Choose which admin tools {{ displayName }} can open. Everything else is hidden and blocked on the server.
          </p>
        </div>
        <button class="ml-auto h-7 w-7 shrink-0 grid place-items-center rounded text-gray-500 hover:bg-gray-100" aria-label="Close" @click="onCancel">✕</button>
      </div>

      <!-- Controls -->
      <div class="px-4 py-3 border-b bg-gray-50 space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <label class="text-xs text-gray-600" for="subadmin-preset">Start from</label>
          <select id="subadmin-preset" class="border rounded-md px-2 py-1 text-xs bg-white" v-model="presetChoice" @change="applyPreset">
            <option value="">Choose a preset…</option>
            <option v-for="p in ADMIN_PERMISSION_PRESETS" :key="p.id" :value="`preset:${p.id}`">{{ p.label }}</option>
            <optgroup v-if="copySources.length" label="Copy from another sub-admin">
              <option v-for="c in copySources" :key="c.id" :value="`copy:${c.id}`">{{ c.username || c.discordTag }}</option>
            </optgroup>
            <option value="none">No access</option>
          </select>
          <span class="ml-auto text-xs font-semibold tabular-nums">{{ enabledCount }} of {{ totalGrantable }} tools</span>
        </div>
        <div class="h-1 rounded bg-gray-200 overflow-hidden"><div class="h-full bg-blue-600 transition-all" :style="{ width: pct + '%' }"></div></div>
        <div class="flex flex-wrap items-center gap-2">
          <input v-model="q" type="search" placeholder="Filter tools…" aria-label="Filter tools" class="flex-1 min-w-[10rem] border rounded-md px-2 py-1 text-xs bg-white" />
          <button type="button" class="px-2 py-1 text-xs border rounded-md" :class="onlyOn ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white'" :aria-pressed="onlyOn" @click="onlyOn = !onlyOn">Enabled only</button>
          <button type="button" class="px-2 py-1 text-xs border rounded-md bg-white" @click="setAll(true)">Enable all</button>
          <button type="button" class="px-2 py-1 text-xs border rounded-md bg-white" @click="setAll(false)">Disable all</button>
        </div>
      </div>

      <!-- Tool list -->
      <div class="flex-1 overflow-y-auto min-h-[10rem]">
        <p v-if="!visibleGroups.length" class="px-4 py-8 text-center text-gray-500">No tools match “{{ q }}”.</p>
        <section v-for="g in visibleGroups" :key="g.id" class="border-b">
          <div class="flex items-center gap-2 px-4 py-2 sticky top-0 bg-white z-10">
            <button type="button" class="h-6 w-6 text-gray-500 transition-transform" :class="isOpen(g) ? 'rotate-90' : ''" :aria-expanded="isOpen(g)" :aria-label="`Expand ${g.label}`" @click="toggleOpen(g.id)">▸</button>
            <button type="button" class="flex-1 text-left font-semibold" @click="toggleOpen(g.id)">{{ g.label }}</button>
            <span class="text-xs text-gray-500 tabular-nums">{{ groupCount(g) }}/{{ g.grantable.length }}</span>
            <button
              type="button" role="switch" :aria-checked="groupState(g)" :aria-label="`All ${g.label}`"
              class="relative h-5 w-9 rounded-full transition-colors shrink-0"
              :class="groupState(g) === 'true' ? 'bg-blue-600' : groupState(g) === 'mixed' ? 'bg-blue-300' : 'bg-gray-300'"
              @click="toggleGroup(g)"
            >
              <span class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform" :class="groupState(g) === 'true' ? 'translate-x-4' : groupState(g) === 'mixed' ? 'translate-x-2' : ''"></span>
            </button>
          </div>
          <div v-show="isOpen(g)" class="pb-1.5">
            <div
              v-for="it in g.items" :key="it.perm"
              class="flex items-center gap-3 pl-12 pr-4 py-1.5 hover:bg-gray-50"
              :class="it.superOnly ? 'opacity-60' : ''"
            >
              <div class="flex-1 min-w-0">
                <div class="font-medium">{{ it.label }}</div>
                <div v-if="it.desc" class="text-xs text-gray-500">{{ it.desc }}</div>
              </div>
              <span v-if="it.sensitive" class="px-1.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">Sensitive</span>
              <span v-if="it.superOnly" class="px-1.5 rounded-full text-[10px] font-semibold bg-gray-200 text-gray-600">Super-admin only</span>
              <button
                type="button" role="switch" :aria-checked="selected.has(it.perm)" :aria-label="it.label" :disabled="it.superOnly"
                class="relative h-5 w-9 rounded-full transition-colors shrink-0 disabled:cursor-not-allowed"
                :class="selected.has(it.perm) ? 'bg-blue-600' : 'bg-gray-300'"
                @click="toggle(it.perm)"
              >
                <span class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform" :class="selected.has(it.perm) ? 'translate-x-4' : ''"></span>
              </button>
            </div>
          </div>
        </section>
      </div>

      <!-- Footer -->
      <div class="border-t px-4 py-3 space-y-2">
        <template v-if="confirming">
          <div class="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-xs">
            <b>Confirm sensitive access.</b> {{ displayName }} will be able to: {{ sensitiveLabels.join(', ') }}.
          </div>
        </template>
        <template v-else>
          <div v-if="sensitiveLabels.length" class="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-xs">
            <b>{{ sensitiveLabels.length }} sensitive tool{{ sensitiveLabels.length > 1 ? 's' : '' }} on:</b> {{ sensitiveLabels.join(', ') }}.
          </div>
          <p class="text-xs text-gray-500">
            Takes effect within about 10 seconds, no re-login. Every change is recorded in Admin Changes. Sub-admins can never grant admin access or open the old /admin pages.
          </p>
        </template>
        <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <button v-if="isEdit && !confirming" type="button" class="mr-auto px-3 py-1.5 text-sm border rounded-md text-red-700" :disabled="working" @click="remove">Remove admin</button>
          <template v-if="confirming">
            <button type="button" class="px-3 py-1.5 text-sm border rounded-md" :disabled="working" @click="confirming = false">Back</button>
            <button type="button" class="px-3 py-1.5 text-sm rounded-md text-white bg-blue-600 hover:bg-blue-700" :disabled="working" @click="save">{{ working ? 'Saving…' : 'Yes, grant access' }}</button>
          </template>
          <template v-else>
            <button type="button" class="px-3 py-1.5 text-sm border rounded-md" :disabled="working" @click="onCancel">Cancel</button>
            <button
              type="button" class="px-3 py-1.5 text-sm rounded-md text-white"
              :class="enabledCount ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300 cursor-not-allowed'"
              :disabled="!enabledCount || working" @click="onPrimary"
            >{{ primaryLabel }}</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { grantableAdminTree } from '~/utils/adminSections'
import { ADMIN_PERMISSION_PRESETS, isAdminPermissionKey } from '~/utils/adminPermissions'

const props = defineProps({
  // Row from /api/admin/users
  user: { type: Object, required: true },
  // Other sub-admins (rows from /api/admin/users) offered under "Copy from…"
  subAdmins: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'saved'])

const isEdit = computed(() => Boolean(props.user.isAdmin && props.user.adminRestricted))
const displayName = computed(() => props.user.username || props.user.discordTag || 'this user')
const title = computed(() => `${isEdit.value ? 'Edit sub-admin access' : 'Make sub-admin'} · ${displayName.value}`)

// Super-admin-only tools are listed (so the admin sees they exist) but are never selectable.
const groups = grantableAdminTree().map(g => ({ ...g, grantable: g.items.filter(i => !i.superOnly) }))
const sensitiveByPerm = new Map(groups.flatMap(g => g.items).map(i => [i.perm, i]))
const totalGrantable = groups.reduce((n, g) => n + g.grantable.length, 0)

const selected = ref(new Set(isEdit.value
  ? (props.user.adminPermissions || []).filter(isAdminPermissionKey)
  : []))
const openGroups = ref(Object.fromEntries(groups.map(g => [g.id, g.grantable.some(i => selected.value.has(i.perm))])))
const q = ref('')
const onlyOn = ref(false)
const presetChoice = ref('')
const confirming = ref(false)
const working = ref(false)
const error = ref('')

const copySources = computed(() => props.subAdmins.filter(u => u.id !== props.user.id && u.adminRestricted))

const enabledCount = computed(() => selected.value.size)
const pct = computed(() => Math.round((enabledCount.value / totalGrantable) * 100))
const sensitiveLabels = computed(() =>
  [...selected.value].map(p => sensitiveByPerm.get(p)).filter(i => i?.sensitive).map(i => i.label))
const primaryLabel = computed(() => {
  if (!enabledCount.value) return 'Enable at least one tool'
  if (sensitiveLabels.value.length) return 'Review & save'
  return isEdit.value ? 'Save access' : 'Make sub-admin'
})

const needle = computed(() => q.value.trim().toLowerCase())
const visibleGroups = computed(() => groups
  .map(g => ({
    ...g,
    items: g.items.filter(i =>
      (!needle.value || `${i.label} ${i.desc}`.toLowerCase().includes(needle.value)) &&
      (!onlyOn.value || selected.value.has(i.perm))
    )
  }))
  .filter(g => g.items.length))

function isOpen (g) { return Boolean(needle.value || onlyOn.value || openGroups.value[g.id]) }
function toggleOpen (id) { openGroups.value = { ...openGroups.value, [id]: !openGroups.value[id] } }
function groupCount (g) { return g.grantable.filter(i => selected.value.has(i.perm)).length }
function groupState (g) {
  const n = groupCount(g)
  return n === 0 ? 'false' : n === g.grantable.length ? 'true' : 'mixed'
}

function mutate (fn) {
  const next = new Set(selected.value)
  fn(next)
  selected.value = next
  confirming.value = false
  error.value = ''
}
function toggle (perm) { mutate(s => (s.has(perm) ? s.delete(perm) : s.add(perm))) }
function toggleGroup (g) {
  const allOn = groupState(g) === 'true'
  mutate(s => g.grantable.forEach(i => (allOn ? s.delete(i.perm) : s.add(i.perm))))
  if (!allOn) openGroups.value = { ...openGroups.value, [g.id]: true }
}
function setAll (on) {
  mutate(s => { s.clear(); if (on) groups.forEach(g => g.grantable.forEach(i => s.add(i.perm))) })
  if (on) openGroups.value = Object.fromEntries(groups.map(g => [g.id, true]))
}
function applyPreset () {
  const v = presetChoice.value
  let perms = null
  if (v === 'none') perms = []
  else if (v.startsWith('preset:')) perms = ADMIN_PERMISSION_PRESETS.find(p => p.id === v.slice(7))?.perms
  else if (v.startsWith('copy:')) perms = copySources.value.find(u => u.id === v.slice(5))?.adminPermissions
  if (perms) {
    const allowed = perms.filter(isAdminPermissionKey)
    mutate(s => { s.clear(); allowed.forEach(p => s.add(p)) })
    openGroups.value = Object.fromEntries(groups.map(g => [g.id, g.grantable.some(i => selected.value.has(i.perm))]))
  }
  presetChoice.value = ''
}

function onPrimary () {
  if (!enabledCount.value) return
  if (sensitiveLabels.value.length) { confirming.value = true; return }
  save()
}
function onCancel () { if (!working.value) emit('close') }

async function call (body) {
  working.value = true
  error.value = ''
  try {
    const res = await $fetch(`/api/admin/users/${props.user.id}/admin-access`, { method: 'POST', body })
    emit('saved', res.user)
  } catch (e) {
    error.value = e?.data?.statusMessage || e?.message || 'Failed to save'
    confirming.value = false
  } finally {
    working.value = false
  }
}
function save () { return call({ level: 'sub', permissions: [...selected.value] }) }
function remove () { return call({ level: 'none' }) }
</script>
