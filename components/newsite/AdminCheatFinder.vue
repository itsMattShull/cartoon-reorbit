<template>
  <div class="admin-cheat-finder bg-gray-50">
    <div class="p-2 text-xs">
      <h1 class="text-base font-bold mb-2">Cheat Finder</h1>

      <!-- Tabs -->
      <div class="flex space-x-3 border-b border-gray-300 mb-2 overflow-x-auto">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="activeTab === tab.id
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'text-gray-500 hover:text-gray-700'"
          class="pb-1 px-1 text-xs font-medium whitespace-nowrap"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Duplicate IPs tab -->
      <div v-if="activeTab === 'duplicateIps'">
        <div class="mb-2">
          <input
            v-model="searchTerm"
            type="text"
            placeholder="Search usernames…"
            class="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div class="mb-2">
          <label class="inline-flex items-center gap-1.5 text-[11px] text-gray-600 select-none py-1 min-h-[32px]">
            <input type="checkbox" v-model="showConfirmedIps" class="h-4 w-4 accent-indigo-600" />
            Show confirmed matches
          </label>
        </div>

        <template v-if="!showConfirmedIps">
        <div v-if="loading" class="text-gray-500">Loading…</div>
        <div v-else-if="groups.length === 0" class="text-gray-500">No IPs with multiple users found.</div>

        <div v-else class="space-y-2">
          <div
            v-for="group in groups"
            :key="group.groupKey"
            class="bg-white border rounded shadow p-2"
          >
            <div class="flex items-start justify-between mb-1 gap-2">
              <div class="min-w-0">
                <h2 class="font-mono font-semibold text-xs truncate">{{ group.ip }}</h2>
                <span class="text-[10px] text-gray-500">{{ group.aliases.length }} accounts</span>
              </div>
              <CheatFinderConfirmButton
                :label="`IP ${group.ip}`"
                :pending="!!confirmingIpKeys[group.groupKey]"
                @confirm="onConfirmIpGroup(group)"
              />
            </div>

            <!-- Desktop table -->
            <div class="hidden md:block overflow-x-auto">
              <table class="min-w-full text-[11px]">
                <thead class="bg-gray-50 text-left">
                  <tr>
                    <th class="px-1.5 py-1 border-b">Username</th>
                    <th class="px-1.5 py-1 border-b">Joined</th>
                    <th class="px-1.5 py-1 border-b">Discord Username</th>
                    <th class="px-1.5 py-1 border-b">Discord Account Created</th>
                    <th class="px-1.5 py-1 border-b">Latest Device</th>
                    <th class="px-1.5 py-1 border-b">Has Traded With</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="alias in group.aliases" :key="alias.username" class="border-b last:border-b-0 align-top">
                    <td class="px-1.5 py-1">
                      <div class="font-medium">
                        {{ alias.username }}
                        <span
                          v-if="alias.isAdmin"
                          class="ml-1 px-1 py-0.5 text-[9px] uppercase tracking-wide rounded bg-amber-100 text-amber-800 border border-amber-300"
                          title="This account is an admin — likely legitimate testing"
                        >Admin</span>
                      </div>
                      <div class="text-[10px] text-gray-500 mt-0.5">
                        {{ formatNumber(alias.points) }} pts · {{ formatNumber(alias.ctoonCount) }} ctoons · Last login {{ formatDateTime(alias.lastLogin) }}
                      </div>
                      <div
                        v-if="alias.latestVisitorId"
                        class="text-[10px] text-gray-500 font-mono break-all"
                        :title="alias.latestVisitorAt ? `Captured ${formatDateTime(alias.latestVisitorAt)}` : ''"
                      >
                        Browser: {{ alias.latestVisitorId }}
                      </div>
                    </td>
                    <td class="px-1.5 py-1 whitespace-nowrap">{{ formatDate(alias.joined) }}</td>
                    <td class="px-1.5 py-1">{{ alias.discordTag || '—' }}</td>
                    <td class="px-1.5 py-1 whitespace-nowrap">{{ formatDate(alias.discordCreatedAt) }}</td>
                    <td class="px-1.5 py-1 whitespace-nowrap">
                      <span v-if="alias.latestDeviceType">{{ alias.latestDeviceType }}</span>
                      <span v-else class="text-gray-400">—</span>
                    </td>
                    <td class="px-1.5 py-1">
                      <template v-if="alias.tradedWith && alias.tradedWith.length">
                        <div v-for="(pair, rIdx) in chunk(alias.tradedWith, 2)" :key="rIdx">
                          <template v-for="(partner, idx) in pair" :key="partner.userId">
                            <a
                              href="#"
                              class="text-indigo-600 hover:underline"
                              @click.prevent
                            >{{ partner.username }}</a><span v-if="idx < pair.length - 1">, </span>
                          </template>
                        </div>
                      </template>
                      <span v-else class="text-gray-400">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Mobile cards -->
            <div class="md:hidden space-y-1.5">
              <div
                v-for="alias in group.aliases"
                :key="alias.username"
                class="border rounded p-1.5 bg-gray-50"
              >
                <div class="font-medium text-[11px]">
                  {{ alias.username }}
                  <span
                    v-if="alias.isAdmin"
                    class="ml-1 px-1 py-0.5 text-[9px] uppercase tracking-wide rounded bg-amber-100 text-amber-800 border border-amber-300"
                  >Admin</span>
                </div>
                <div class="text-[10px] text-gray-500 mt-0.5">
                  {{ formatNumber(alias.points) }} pts · {{ formatNumber(alias.ctoonCount) }} ctoons · Last login {{ formatDateTime(alias.lastLogin) }}
                </div>
                <div
                  v-if="alias.latestVisitorId"
                  class="text-[10px] text-gray-500 font-mono break-all"
                  :title="alias.latestVisitorAt ? `Captured ${formatDateTime(alias.latestVisitorAt)}` : ''"
                >
                  Browser: {{ alias.latestVisitorId }}
                </div>
                <div class="mt-1 grid grid-cols-1 gap-0.5 text-[10px] text-gray-700">
                  <div><span class="text-gray-500">Joined:</span> {{ formatDate(alias.joined) }}</div>
                  <div><span class="text-gray-500">Discord:</span> {{ alias.discordTag || '—' }}</div>
                  <div><span class="text-gray-500">Discord Created:</span> {{ formatDate(alias.discordCreatedAt) }}</div>
                  <div>
                    <span class="text-gray-500">Latest Device:</span>
                    <span v-if="alias.latestDeviceType">{{ alias.latestDeviceType }}</span>
                    <span v-else class="text-gray-400">—</span>
                  </div>
                  <div>
                    <span class="text-gray-500">Has Traded With:</span>
                    <template v-if="alias.tradedWith && alias.tradedWith.length">
                      <div v-for="(pair, rIdx) in chunk(alias.tradedWith, 2)" :key="rIdx" class="ml-1">
                        <template v-for="(partner, idx) in pair" :key="partner.userId">
                          <a href="#" class="text-indigo-600 hover:underline" @click.prevent>{{ partner.username }}</a><span v-if="idx < pair.length - 1">, </span>
                        </template>
                      </div>
                    </template>
                    <span v-else class="text-gray-400">—</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!loading && total > 0" class="mt-3 flex items-center justify-between">
          <div class="text-[11px] text-gray-600">
            Page {{ page }} of {{ totalPages }} - Showing {{ showingRange }}
          </div>
          <div class="space-x-1">
            <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page <= 1" @click="prevPage">Prev</button>
            <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page >= totalPages" @click="nextPage">Next</button>
          </div>
        </div>
        </template>

        <template v-else>
          <div v-if="confirmedIpsLoading" class="text-gray-500">Loading…</div>
          <div v-else-if="confirmedIpsItems.length === 0" class="text-gray-500">No confirmed matches yet.</div>
          <div v-else class="space-y-2">
            <div
              v-for="item in confirmedIpsItems"
              :key="item.groupKey"
              class="bg-white border rounded shadow p-2"
            >
              <div class="flex items-start justify-between mb-1 gap-2">
                <div class="min-w-0 text-[11px] text-gray-700">
                  <div class="font-medium break-words">{{ item.aliasUsernames.join(', ') }}</div>
                  <div class="text-[10px] text-gray-500 mt-0.5">
                    Confirmed by {{ item.confirmedByUsername || 'unknown' }} · {{ formatDateTime(item.confirmedAt) }}
                  </div>
                  <div v-if="item.note" class="text-[10px] text-gray-500 italic mt-0.5">{{ item.note }}</div>
                </div>
                <button
                  type="button"
                  class="min-h-[36px] px-2 py-1 text-[11px] font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                  @click="onUnconfirmIp(item)"
                >
                  Unconfirm
                </button>
              </div>
            </div>
          </div>

          <div v-if="!confirmedIpsLoading && confirmedIpsTotal > 0" class="mt-3 flex items-center justify-between">
            <div class="text-[11px] text-gray-600">
              Page {{ confirmedIpsPage }} of {{ confirmedIpsTotalPages }}
            </div>
            <div class="space-x-1">
              <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="confirmedIpsPage <= 1" @click="confirmedIpsPrevPage">Prev</button>
              <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="confirmedIpsPage >= confirmedIpsTotalPages" @click="confirmedIpsNextPage">Next</button>
            </div>
          </div>
        </template>
      </div>

      <!-- Duplicate VPN tab -->
      <div v-else-if="activeTab === 'duplicateVpn'">
        <div class="mb-2">
          <input
            v-model="vpnSearchTerm"
            type="text"
            placeholder="Search usernames… (3+ characters)"
            class="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
          <div v-if="vpnSearchTerm.length > 0 && vpnSearchTerm.length < 3" class="mt-0.5 text-[10px] text-gray-400">
            Type at least 3 characters to search
          </div>
        </div>
        <div class="mb-2">
          <label class="inline-flex items-center gap-1.5 text-[11px] text-gray-600 select-none py-1 min-h-[32px]">
            <input type="checkbox" v-model="showConfirmedVpn" class="h-4 w-4 accent-indigo-600" />
            Show confirmed matches
          </label>
        </div>

        <template v-if="!showConfirmedVpn">
        <div v-if="vpnLoading" class="text-gray-500">Loading…</div>
        <div v-else-if="vpnGroups.length === 0" class="text-gray-500">No ASN groups with multiple VPN users found.</div>

        <div v-else class="space-y-2">
          <div
            v-for="group in vpnGroups"
            :key="group.groupKey"
            class="bg-white border rounded shadow p-2"
          >
            <!-- VPN group header -->
            <div class="flex items-start justify-between mb-1 gap-2">
              <div class="min-w-0">
                <h2 class="font-mono font-semibold text-xs truncate">{{ group.asn }}</h2>
                <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-600 mt-0.5">
                  <span v-if="group.isp"><span class="text-gray-400">ISP:</span> {{ group.isp }}</span>
                  <span v-if="group.org && group.org !== group.isp"><span class="text-gray-400">Org:</span> {{ group.org }}</span>
                  <span v-if="group.country"><span class="text-gray-400">Country:</span> {{ group.country }}</span>
                  <span v-if="group.proxyType"><span class="text-gray-400">Type:</span> {{ group.proxyType }}</span>
                </div>
                <div v-if="group.reason" class="text-[10px] text-gray-400 mt-0.5 italic">{{ group.reason }}</div>
                <span class="text-[10px] text-gray-500 whitespace-nowrap">{{ group.aliases.length }} accounts</span>
              </div>
              <CheatFinderConfirmButton
                :label="`ASN ${group.asn}`"
                :pending="!!confirmingVpnKeys[group.groupKey]"
                @confirm="onConfirmVpnGroup(group)"
              />
            </div>

            <!-- Desktop table -->
            <div class="hidden md:block overflow-x-auto">
              <table class="min-w-full text-[11px]">
                <thead class="bg-gray-50 text-left">
                  <tr>
                    <th class="px-1.5 py-1 border-b">Username</th>
                    <th class="px-1.5 py-1 border-b">Joined</th>
                    <th class="px-1.5 py-1 border-b">Discord Username</th>
                    <th class="px-1.5 py-1 border-b">Discord Account Created</th>
                    <th class="px-1.5 py-1 border-b">VPN IP</th>
                    <th class="px-1.5 py-1 border-b">Latest Device</th>
                    <th class="px-1.5 py-1 border-b">Has Traded With</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="alias in group.aliases" :key="alias.username" class="border-b last:border-b-0 align-top">
                    <td class="px-1.5 py-1">
                      <div class="font-medium">
                        {{ alias.username }}
                        <span
                          v-if="alias.isAdmin"
                          class="ml-1 px-1 py-0.5 text-[9px] uppercase tracking-wide rounded bg-amber-100 text-amber-800 border border-amber-300"
                          title="This account is an admin — likely legitimate testing"
                        >Admin</span>
                      </div>
                      <div class="text-[10px] text-gray-500 mt-0.5">
                        {{ formatNumber(alias.points) }} pts · {{ formatNumber(alias.ctoonCount) }} ctoons · Last seen {{ formatDateTime(alias.lastSeen) }}
                      </div>
                      <div
                        v-if="alias.latestVisitorId"
                        class="text-[10px] text-gray-500 font-mono break-all"
                        :title="alias.latestVisitorAt ? `Captured ${formatDateTime(alias.latestVisitorAt)}` : ''"
                      >
                        Browser: {{ alias.latestVisitorId }}
                      </div>
                    </td>
                    <td class="px-1.5 py-1 whitespace-nowrap">{{ formatDate(alias.joined) }}</td>
                    <td class="px-1.5 py-1">{{ alias.discordTag || '—' }}</td>
                    <td class="px-1.5 py-1 whitespace-nowrap">{{ formatDate(alias.discordCreatedAt) }}</td>
                    <td class="px-1.5 py-1 font-mono text-[10px]">{{ alias.ip || '—' }}</td>
                    <td class="px-1.5 py-1 whitespace-nowrap">
                      <span v-if="alias.latestDeviceType">{{ alias.latestDeviceType }}</span>
                      <span v-else class="text-gray-400">—</span>
                    </td>
                    <td class="px-1.5 py-1">
                      <template v-if="alias.tradedWith && alias.tradedWith.length">
                        <div v-for="(pair, rIdx) in chunk(alias.tradedWith, 2)" :key="rIdx">
                          <template v-for="(partner, idx) in pair" :key="partner.userId">
                            <a
                              href="#"
                              class="text-indigo-600 hover:underline"
                              @click.prevent
                            >{{ partner.username }}</a><span v-if="idx < pair.length - 1">, </span>
                          </template>
                        </div>
                      </template>
                      <span v-else class="text-gray-400">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Mobile cards -->
            <div class="md:hidden space-y-1.5">
              <div
                v-for="alias in group.aliases"
                :key="alias.username"
                class="border rounded p-1.5 bg-gray-50"
              >
                <div class="font-medium text-[11px]">
                  {{ alias.username }}
                  <span
                    v-if="alias.isAdmin"
                    class="ml-1 px-1 py-0.5 text-[9px] uppercase tracking-wide rounded bg-amber-100 text-amber-800 border border-amber-300"
                  >Admin</span>
                </div>
                <div class="text-[10px] text-gray-500 mt-0.5">
                  {{ formatNumber(alias.points) }} pts · {{ formatNumber(alias.ctoonCount) }} ctoons · Last seen {{ formatDateTime(alias.lastSeen) }}
                </div>
                <div
                  v-if="alias.latestVisitorId"
                  class="text-[10px] text-gray-500 font-mono break-all"
                  :title="alias.latestVisitorAt ? `Captured ${formatDateTime(alias.latestVisitorAt)}` : ''"
                >
                  Browser: {{ alias.latestVisitorId }}
                </div>
                <div class="mt-1 grid grid-cols-1 gap-0.5 text-[10px] text-gray-700">
                  <div><span class="text-gray-500">Joined:</span> {{ formatDate(alias.joined) }}</div>
                  <div><span class="text-gray-500">Discord:</span> {{ alias.discordTag || '—' }}</div>
                  <div><span class="text-gray-500">Discord Created:</span> {{ formatDate(alias.discordCreatedAt) }}</div>
                  <div><span class="text-gray-500">VPN IP:</span> <span class="font-mono">{{ alias.ip || '—' }}</span></div>
                  <div>
                    <span class="text-gray-500">Latest Device:</span>
                    <span v-if="alias.latestDeviceType">{{ alias.latestDeviceType }}</span>
                    <span v-else class="text-gray-400">—</span>
                  </div>
                  <div>
                    <span class="text-gray-500">Has Traded With:</span>
                    <template v-if="alias.tradedWith && alias.tradedWith.length">
                      <div v-for="(pair, rIdx) in chunk(alias.tradedWith, 2)" :key="rIdx" class="ml-1">
                        <template v-for="(partner, idx) in pair" :key="partner.userId">
                          <a href="#" class="text-indigo-600 hover:underline" @click.prevent>{{ partner.username }}</a><span v-if="idx < pair.length - 1">, </span>
                        </template>
                      </div>
                    </template>
                    <span v-else class="text-gray-400">—</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!vpnLoading && vpnTotal > 0" class="mt-3 flex items-center justify-between">
          <div class="text-[11px] text-gray-600">
            Page {{ vpnPage }} of {{ vpnTotalPages }} - Showing {{ vpnShowingRange }}
          </div>
          <div class="space-x-1">
            <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="vpnPage <= 1" @click="vpnPrevPage">Prev</button>
            <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="vpnPage >= vpnTotalPages" @click="vpnNextPage">Next</button>
          </div>
        </div>
        </template>

        <template v-else>
          <div v-if="confirmedVpnLoading" class="text-gray-500">Loading…</div>
          <div v-else-if="confirmedVpnItems.length === 0" class="text-gray-500">No confirmed matches yet.</div>
          <div v-else class="space-y-2">
            <div
              v-for="item in confirmedVpnItems"
              :key="item.groupKey"
              class="bg-white border rounded shadow p-2"
            >
              <div class="flex items-start justify-between mb-1 gap-2">
                <div class="min-w-0 text-[11px] text-gray-700">
                  <div class="font-medium break-words">{{ item.aliasUsernames.join(', ') }}</div>
                  <div class="text-[10px] text-gray-500 mt-0.5">
                    Confirmed by {{ item.confirmedByUsername || 'unknown' }} · {{ formatDateTime(item.confirmedAt) }}
                  </div>
                  <div v-if="item.note" class="text-[10px] text-gray-500 italic mt-0.5">{{ item.note }}</div>
                </div>
                <button
                  type="button"
                  class="min-h-[36px] px-2 py-1 text-[11px] font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                  @click="onUnconfirmVpn(item)"
                >
                  Unconfirm
                </button>
              </div>
            </div>
          </div>

          <div v-if="!confirmedVpnLoading && confirmedVpnTotal > 0" class="mt-3 flex items-center justify-between">
            <div class="text-[11px] text-gray-600">
              Page {{ confirmedVpnPage }} of {{ confirmedVpnTotalPages }}
            </div>
            <div class="space-x-1">
              <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="confirmedVpnPage <= 1" @click="confirmedVpnPrevPage">Prev</button>
              <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="confirmedVpnPage >= confirmedVpnTotalPages" @click="confirmedVpnNextPage">Next</button>
            </div>
          </div>
        </template>
      </div>

      <!-- Placeholder tabs -->
      <div v-else class="text-gray-500 py-8 text-center">
        Placeholder
      </div>

      <!-- Undo toast -->
      <div
        v-if="toast"
        role="status"
        class="fixed left-1/2 bottom-4 -translate-x-1/2 z-50 max-w-[92vw] bg-gray-900 text-white text-[11px] rounded shadow-lg pl-3 pr-1 py-1 flex items-center gap-2"
      >
        <span class="break-words">{{ toast.message }}</span>
        <button
          type="button"
          class="min-h-[36px] px-2 font-semibold text-indigo-300 hover:text-indigo-200 underline whitespace-nowrap"
          @click="onToastUndo"
        >
          Undo
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'

const tabs = [
  { id: 'duplicateIps', label: 'Duplicate IPs' },
  { id: 'duplicateVpn', label: 'Duplicate VPN' },
  { id: 'placeholder-2', label: 'Placeholder' },
  { id: 'placeholder-3', label: 'Placeholder' },
  { id: 'placeholder-4', label: 'Placeholder' },
  { id: 'placeholder-5', label: 'Placeholder' }
]
const activeTab = ref('duplicateIps')

// ── Duplicate IPs state ───────────────────────────────────────────────────────
const groups = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 100
const loading = ref(false)
const searchTerm = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const showingRange = computed(() => {
  if (!total.value) return '0-0 of 0'
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, total.value)
  return `${start}-${end} of ${total.value}`
})

// ── Duplicate VPN state ───────────────────────────────────────────────────────
const vpnGroups = ref([])
const vpnTotal = ref(0)
const vpnPage = ref(1)
const vpnLoading = ref(false)
const vpnSearchTerm = ref('')

const vpnTotalPages = computed(() => Math.max(1, Math.ceil(vpnTotal.value / pageSize)))
const vpnShowingRange = computed(() => {
  if (!vpnTotal.value) return '0-0 of 0'
  const start = (vpnPage.value - 1) * pageSize + 1
  const end = Math.min(vpnPage.value * pageSize, vpnTotal.value)
  return `${start}-${end} of ${vpnTotal.value}`
})

// ── Confirm / unconfirm (Cheat Finder matches) state ────────────────────────────
const showConfirmedIps = ref(false)
const confirmingIpKeys = reactive({})
const confirmedIpsItems = ref([])
const confirmedIpsTotal = ref(0)
const confirmedIpsPage = ref(1)
const confirmedIpsLoading = ref(false)
const confirmedIpsTotalPages = computed(() => Math.max(1, Math.ceil(confirmedIpsTotal.value / pageSize)))

const showConfirmedVpn = ref(false)
const confirmingVpnKeys = reactive({})
const confirmedVpnItems = ref([])
const confirmedVpnTotal = ref(0)
const confirmedVpnPage = ref(1)
const confirmedVpnLoading = ref(false)
const confirmedVpnTotalPages = computed(() => Math.max(1, Math.ceil(confirmedVpnTotal.value / pageSize)))

// { message, onUndo } | null
const toast = ref(null)
let toastTimeoutId = null
function showToast(message, onUndo) {
  if (toastTimeoutId) clearTimeout(toastTimeoutId)
  toast.value = { message, onUndo }
  toastTimeoutId = setTimeout(() => { toast.value = null }, 5000)
}
async function onToastUndo() {
  const current = toast.value
  if (!current) return
  toast.value = null
  if (toastTimeoutId) clearTimeout(toastTimeoutId)
  await current.onUndo?.()
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function formatDateTime(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatNumber(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US')
}

function chunk(arr, size) {
  if (!Array.isArray(arr) || size <= 0) return []
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ── Duplicate IPs fetch ───────────────────────────────────────────────────────
async function fetchGroups() {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      limit: String(pageSize)
    })
    const term = searchTerm.value.trim()
    if (term) params.set('username', term)

    const res = await fetch(`/api/admin/duplicate-users?${params.toString()}`, { credentials: 'include' })
    if (!res.ok) {
      groups.value = []
      total.value = 0
      return
    }
    const data = await res.json()
    groups.value = data.groups || []
    total.value = data.total || 0
    if (data.page) page.value = data.page
  } catch (e) {
    console.error('Failed to load duplicate users', e)
    groups.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
  fetchGroups()
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  fetchGroups()
}

// ── Duplicate VPN fetch ───────────────────────────────────────────────────────
async function fetchVpnGroups() {
  vpnLoading.value = true
  try {
    const params = new URLSearchParams({
      page: String(vpnPage.value),
      limit: String(pageSize)
    })
    const term = vpnSearchTerm.value.trim()
    // Only send search term to API when 3+ characters
    if (term.length >= 3) params.set('username', term)

    const res = await fetch(`/api/admin/duplicate-vpn?${params.toString()}`, { credentials: 'include' })
    if (!res.ok) {
      vpnGroups.value = []
      vpnTotal.value = 0
      return
    }
    const data = await res.json()
    vpnGroups.value = data.groups || []
    vpnTotal.value = data.total || 0
    if (data.page) vpnPage.value = data.page
  } catch (e) {
    console.error('Failed to load duplicate VPN groups', e)
    vpnGroups.value = []
    vpnTotal.value = 0
  } finally {
    vpnLoading.value = false
  }
}

function vpnNextPage() {
  if (vpnPage.value >= vpnTotalPages.value) return
  vpnPage.value += 1
  fetchVpnGroups()
}

function vpnPrevPage() {
  if (vpnPage.value <= 1) return
  vpnPage.value -= 1
  fetchVpnGroups()
}

// ── Confirm / unconfirm API ──────────────────────────────────────────────────
async function confirmMatch(type, aliasUsernames) {
  const res = await fetch('/api/admin/cheat-finder/confirm', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, aliasUsernames })
  })
  if (!res.ok) throw new Error('Failed to confirm match')
  return res.json()
}

async function unconfirmMatch(type, groupKey) {
  const res = await fetch('/api/admin/cheat-finder/unconfirm', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, groupKey })
  })
  if (!res.ok) throw new Error('Failed to unconfirm match')
  return res.json()
}

// ── Duplicate IPs confirm handlers ───────────────────────────────────────────
async function onConfirmIpGroup(group) {
  confirmingIpKeys[group.groupKey] = true
  try {
    await confirmMatch('duplicateIps', group.aliases.map((a) => a.username))
    const idx = groups.value.findIndex((g) => g.groupKey === group.groupKey)
    if (idx !== -1) groups.value.splice(idx, 1)
    total.value = Math.max(0, total.value - 1)
    showToast(`Confirmed ${group.ip} as not cheating.`, async () => {
      try {
        await unconfirmMatch('duplicateIps', group.groupKey)
        await fetchGroups()
      } catch (e) {
        console.error('Failed to undo confirmation', e)
      }
    })
  } catch (e) {
    console.error('Failed to confirm match', e)
  } finally {
    delete confirmingIpKeys[group.groupKey]
  }
}

async function fetchConfirmedIps() {
  confirmedIpsLoading.value = true
  try {
    const params = new URLSearchParams({
      type: 'duplicateIps',
      page: String(confirmedIpsPage.value),
      limit: String(pageSize)
    })
    const res = await fetch(`/api/admin/cheat-finder/confirmed?${params.toString()}`, { credentials: 'include' })
    if (!res.ok) {
      confirmedIpsItems.value = []
      confirmedIpsTotal.value = 0
      return
    }
    const data = await res.json()
    confirmedIpsItems.value = data.items || []
    confirmedIpsTotal.value = data.total || 0
  } catch (e) {
    console.error('Failed to load confirmed IP matches', e)
    confirmedIpsItems.value = []
    confirmedIpsTotal.value = 0
  } finally {
    confirmedIpsLoading.value = false
  }
}

function confirmedIpsNextPage() {
  if (confirmedIpsPage.value >= confirmedIpsTotalPages.value) return
  confirmedIpsPage.value += 1
  fetchConfirmedIps()
}

function confirmedIpsPrevPage() {
  if (confirmedIpsPage.value <= 1) return
  confirmedIpsPage.value -= 1
  fetchConfirmedIps()
}

async function onUnconfirmIp(item) {
  try {
    await unconfirmMatch('duplicateIps', item.groupKey)
    confirmedIpsItems.value = confirmedIpsItems.value.filter((i) => i.groupKey !== item.groupKey)
    confirmedIpsTotal.value = Math.max(0, confirmedIpsTotal.value - 1)
  } catch (e) {
    console.error('Failed to unconfirm match', e)
  }
}

// ── Duplicate VPN confirm handlers ───────────────────────────────────────────
async function onConfirmVpnGroup(group) {
  confirmingVpnKeys[group.groupKey] = true
  try {
    await confirmMatch('duplicateVpn', group.aliases.map((a) => a.username))
    const idx = vpnGroups.value.findIndex((g) => g.groupKey === group.groupKey)
    if (idx !== -1) vpnGroups.value.splice(idx, 1)
    vpnTotal.value = Math.max(0, vpnTotal.value - 1)
    showToast(`Confirmed ASN ${group.asn} as not cheating.`, async () => {
      try {
        await unconfirmMatch('duplicateVpn', group.groupKey)
        await fetchVpnGroups()
      } catch (e) {
        console.error('Failed to undo confirmation', e)
      }
    })
  } catch (e) {
    console.error('Failed to confirm match', e)
  } finally {
    delete confirmingVpnKeys[group.groupKey]
  }
}

async function fetchConfirmedVpn() {
  confirmedVpnLoading.value = true
  try {
    const params = new URLSearchParams({
      type: 'duplicateVpn',
      page: String(confirmedVpnPage.value),
      limit: String(pageSize)
    })
    const res = await fetch(`/api/admin/cheat-finder/confirmed?${params.toString()}`, { credentials: 'include' })
    if (!res.ok) {
      confirmedVpnItems.value = []
      confirmedVpnTotal.value = 0
      return
    }
    const data = await res.json()
    confirmedVpnItems.value = data.items || []
    confirmedVpnTotal.value = data.total || 0
  } catch (e) {
    console.error('Failed to load confirmed VPN matches', e)
    confirmedVpnItems.value = []
    confirmedVpnTotal.value = 0
  } finally {
    confirmedVpnLoading.value = false
  }
}

function confirmedVpnNextPage() {
  if (confirmedVpnPage.value >= confirmedVpnTotalPages.value) return
  confirmedVpnPage.value += 1
  fetchConfirmedVpn()
}

function confirmedVpnPrevPage() {
  if (confirmedVpnPage.value <= 1) return
  confirmedVpnPage.value -= 1
  fetchConfirmedVpn()
}

async function onUnconfirmVpn(item) {
  try {
    await unconfirmMatch('duplicateVpn', item.groupKey)
    confirmedVpnItems.value = confirmedVpnItems.value.filter((i) => i.groupKey !== item.groupKey)
    confirmedVpnTotal.value = Math.max(0, confirmedVpnTotal.value - 1)
  } catch (e) {
    console.error('Failed to unconfirm match', e)
  }
}

// ── Watchers ──────────────────────────────────────────────────────────────────
let searchDebounceId = null
watch(searchTerm, () => {
  if (searchDebounceId) clearTimeout(searchDebounceId)
  searchDebounceId = setTimeout(() => {
    page.value = 1
    fetchGroups()
  }, 300)
})

let vpnSearchDebounceId = null

onBeforeUnmount(() => {
  if (searchDebounceId) clearTimeout(searchDebounceId)
  if (vpnSearchDebounceId) clearTimeout(vpnSearchDebounceId)
  if (toastTimeoutId) clearTimeout(toastTimeoutId)
})
watch(vpnSearchTerm, (val) => {
  if (vpnSearchDebounceId) clearTimeout(vpnSearchDebounceId)
  // Only trigger a fetch when 0 chars (cleared) or 3+ chars
  if (val.trim().length > 0 && val.trim().length < 3) return
  vpnSearchDebounceId = setTimeout(() => {
    vpnPage.value = 1
    fetchVpnGroups()
  }, 300)
})

watch(activeTab, (tab) => {
  if (tab === 'duplicateVpn' && vpnGroups.value.length === 0 && !vpnLoading.value) {
    fetchVpnGroups()
  }
})

watch(showConfirmedIps, (val) => {
  if (val) {
    confirmedIpsPage.value = 1
    fetchConfirmedIps()
  }
})

watch(showConfirmedVpn, (val) => {
  if (val) {
    confirmedVpnPage.value = 1
    fetchConfirmedVpn()
  }
})

onMounted(fetchGroups)
</script>

<style scoped>
.admin-cheat-finder {
  width: 100%;
  min-height: 100%;
  color: #111;
}
</style>
