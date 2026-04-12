<template>
  <div class="p-6 space-y-6 mt-16 md:mt-20">
    <Nav />

    <div class="max-w-6xl mx-auto" style="margin-top: 50px;">
      <div class="flex items-start justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold">Suspicious Activity Monitor</h1>
          <p class="text-sm text-gray-500 mt-1">Define rules to flag users exhibiting suspicious patterns. Run analysis on demand to see current results.</p>
        </div>
      </div>

      <!-- ── Rules section ────────────────────────────────────────────────── -->
      <section class="bg-white border rounded p-4 mb-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-lg">Rules</h2>
          <button
            class="bg-indigo-600 text-white text-sm px-3 py-1.5 rounded hover:bg-indigo-700"
            @click="openCreateRuleModal"
          >+ New Rule</button>
        </div>

        <div v-if="rulesLoading" class="text-sm text-gray-500 py-4 text-center">Loading rules…</div>

        <div v-else-if="rules.length === 0" class="text-sm text-gray-400 py-4 text-center">
          No rules yet. Create one to start monitoring.
        </div>

        <div v-else class="divide-y">
          <div v-for="rule in rules" :key="rule.id" class="py-3 flex items-start gap-3">
            <!-- Active indicator -->
            <button
              :title="rule.isActive ? 'Click to deactivate' : 'Click to activate'"
              class="mt-0.5 flex-shrink-0"
              @click="toggleRuleActive(rule)"
            >
              <span
                class="inline-block w-3 h-3 rounded-full"
                :class="rule.isActive ? 'bg-green-500' : 'bg-gray-300'"
              ></span>
            </button>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium">{{ rule.name }}</span>
                <span v-if="!rule.isActive" class="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">inactive</span>
              </div>
              <p v-if="rule.description" class="text-sm text-gray-500 mt-0.5">{{ rule.description }}</p>
              <div class="text-xs text-gray-400 mt-1 space-x-2">
                <span>{{ rule.timeWindowDays ? `Last ${rule.timeWindowDays} days` : 'All time' }}</span>
                <span>·</span>
                <span>{{ rule.conditionLogic }} logic</span>
                <span>·</span>
                <span>{{ rule.conditions.length }} condition{{ rule.conditions.length !== 1 ? 's' : '' }}</span>
              </div>
              <!-- Condition pills -->
              <div class="flex flex-wrap gap-1 mt-1.5">
                <span
                  v-for="c in rule.conditions"
                  :key="c.id"
                  class="inline-block text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-1.5 py-0.5"
                >
                  {{ metricLabel(c.metric) }} {{ operatorLabel(c.operator) }} {{ c.threshold }}
                </span>
              </div>
            </div>

            <div class="flex gap-2 flex-shrink-0">
              <button
                class="text-sm text-blue-600 hover:underline"
                @click="openEditRuleModal(rule)"
              >Edit</button>
              <button
                class="text-sm text-red-600 hover:underline"
                @click="deleteRule(rule)"
              >Delete</button>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Analysis section ─────────────────────────────────────────────── -->
      <section class="bg-white border rounded p-4">
        <div class="flex items-center gap-4 flex-wrap mb-4">
          <button
            class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 font-medium"
            :disabled="analyzing || rules.filter(r => r.isActive).length === 0"
            @click="runAnalysis"
          >
            <span v-if="analyzing">Analyzing…</span>
            <span v-else>▶ Run Analysis</span>
          </button>

          <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input v-model="showMuted" type="checkbox" class="rounded" />
            Show muted users
          </label>

          <span v-if="analysisResult" class="text-sm text-gray-400 ml-auto">
            {{ rulesEvaluatedLabel }} · {{ analysisResult.flaggedUsers.length }} flagged ·
            Last run {{ lastRunLabel }}
          </span>
        </div>

        <div v-if="analyzeError" class="text-sm text-red-600 mb-3 bg-red-50 border border-red-200 rounded p-2">
          {{ analyzeError }}
        </div>

        <div v-if="!analysisResult && !analyzing" class="text-sm text-gray-400 text-center py-8">
          Click "Run Analysis" to evaluate all active rules against current user data.
        </div>

        <div v-else-if="displayedUsers.length === 0 && analysisResult" class="text-sm text-gray-400 text-center py-8">
          <span v-if="analysisResult.flaggedUsers.length === 0">No users flagged by the current active rules.</span>
          <span v-else>All flagged users are muted. Enable "Show muted users" to see them.</span>
        </div>

        <!-- Flagged user cards -->
        <div v-else class="space-y-3">
          <div
            v-for="user in displayedUsers"
            :key="user.userId"
            class="border rounded"
            :class="user.isMuted ? 'border-gray-200 opacity-60' : 'border-red-200'"
          >
            <!-- User header row -->
            <div class="flex items-start gap-3 p-3">
              <!-- Avatar -->
              <img
                v-if="user.avatar"
                :src="user.avatar"
                class="w-10 h-10 rounded-full flex-shrink-0 object-cover"
                alt=""
              />
              <div v-else class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-500 text-sm font-bold">
                {{ (user.username || '?')[0].toUpperCase() }}
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <a
                    :href="`/admin/users?q=${user.username}`"
                    target="_blank"
                    class="font-semibold text-indigo-700 hover:underline"
                  >{{ user.username || '(no username)' }}</a>
                  <span v-if="user.discordTag" class="text-xs text-gray-400">{{ user.discordTag }}</span>
                  <span
                    v-if="user.isMuted"
                    class="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border"
                    :title="user.muteInfo?.reason ? `Reason: ${user.muteInfo.reason}` : 'No reason given'"
                  >muted{{ user.muteInfo?.mutedBy ? ` by ${user.muteInfo.mutedBy}` : '' }}</span>
                </div>

                <!-- Triggered rules -->
                <div class="flex flex-wrap gap-1 mt-1">
                  <span
                    v-for="rule in user.triggeredRules"
                    :key="rule.ruleId"
                    class="inline-block text-xs bg-red-50 text-red-700 border border-red-200 rounded px-1.5 py-0.5"
                  >{{ rule.ruleName }}</span>
                </div>

                <!-- Quick metric summary -->
                <div class="text-xs text-gray-500 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span v-if="user.metrics.tradeOfferCount != null">
                    {{ user.metrics.tradeOfferCount }} trade{{ user.metrics.tradeOfferCount !== 1 ? 's' : '' }}
                  </span>
                  <span v-if="user.metrics.tradeOfferPartnerCount != null">
                    {{ user.metrics.tradeOfferPartnerCount }} unique partner{{ user.metrics.tradeOfferPartnerCount !== 1 ? 's' : '' }}
                  </span>
                  <span v-if="user.metrics.tradeOfferConcentrationPct != null">
                    {{ user.metrics.tradeOfferConcentrationPct }}% trade concentration
                  </span>
                  <span v-if="user.metrics.auctionWinCount != null">
                    {{ user.metrics.auctionWinCount }} auction win{{ user.metrics.auctionWinCount !== 1 ? 's' : '' }}
                  </span>
                  <span v-if="user.metrics.auctionWinSellerCount != null">
                    from {{ user.metrics.auctionWinSellerCount }} seller{{ user.metrics.auctionWinSellerCount !== 1 ? 's' : '' }}
                  </span>
                  <span v-if="user.metrics.auctionWinConcentrationPct != null">
                    {{ user.metrics.auctionWinConcentrationPct }}% win concentration
                  </span>
                  <span v-if="user.metrics.sharedIPUserCount != null">
                    {{ user.metrics.sharedIPUserCount }} shared-IP account{{ user.metrics.sharedIPUserCount !== 1 ? 's' : '' }}
                  </span>
                </div>
              </div>

              <!-- Action buttons -->
              <div class="flex gap-2 flex-shrink-0">
                <button
                  class="text-xs border rounded px-2 py-1 hover:bg-gray-50"
                  @click="toggleExpand(user.userId)"
                >{{ expandedUsers.has(user.userId) ? '▲ Hide' : '▼ Details' }}</button>
                <button
                  v-if="!user.isMuted"
                  class="text-xs bg-orange-100 text-orange-700 border border-orange-200 rounded px-2 py-1 hover:bg-orange-200"
                  @click="openMuteModal(user)"
                >Mute</button>
                <button
                  v-else
                  class="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-1 hover:bg-blue-100"
                  @click="unmuteUser(user)"
                >Unmute</button>
              </div>
            </div>

            <!-- Expanded detail panel -->
            <div v-if="expandedUsers.has(user.userId)" class="border-t bg-gray-50 p-3 space-y-4">

              <!-- Matched conditions detail -->
              <div>
                <h4 class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Why flagged</h4>
                <div class="space-y-1">
                  <div v-for="rule in user.triggeredRules" :key="rule.ruleId">
                    <div class="text-xs font-medium text-gray-700">{{ rule.ruleName }}</div>
                    <ul class="mt-0.5 space-y-0.5">
                      <li
                        v-for="(cond, i) in rule.matchedConditions"
                        :key="i"
                        class="text-xs text-gray-600 pl-3 before:content-['•'] before:mr-1"
                      >{{ cond }}</li>
                    </ul>
                  </div>
                </div>
              </div>

              <!-- All computed metrics -->
              <div>
                <h4 class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">All metrics computed</h4>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  <div
                    v-for="[key, val] in Object.entries(user.metrics)"
                    :key="key"
                    class="bg-white border rounded px-2 py-1.5 text-xs"
                  >
                    <div class="text-gray-500">{{ metricLabel(key) }}</div>
                    <div class="font-semibold text-gray-800">{{ val }}{{ metricUnit(key) }}</div>
                  </div>
                </div>
              </div>

              <!-- Trade partners -->
              <div v-if="user.context.topTradePartners.length > 0">
                <h4 class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Top trade partners</h4>
                <div class="flex flex-wrap gap-2">
                  <a
                    v-for="p in user.context.topTradePartners"
                    :key="p.userId"
                    :href="`/admin/users?q=${p.username}`"
                    target="_blank"
                    class="inline-flex items-center gap-1 text-xs bg-white border rounded px-2 py-1 hover:bg-indigo-50 text-indigo-700"
                  >
                    {{ p.username || '(unknown)' }}
                    <span class="text-gray-400 font-normal">× {{ p.tradeCount }}</span>
                  </a>
                </div>
              </div>

              <!-- Auction sellers -->
              <div v-if="user.context.topAuctionSellers.length > 0">
                <h4 class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Auction wins by seller</h4>
                <div class="flex flex-wrap gap-2">
                  <a
                    v-for="s in user.context.topAuctionSellers"
                    :key="s.userId"
                    :href="`/admin/users?q=${s.username}`"
                    target="_blank"
                    class="inline-flex items-center gap-1 text-xs bg-white border rounded px-2 py-1 hover:bg-indigo-50 text-indigo-700"
                  >
                    {{ s.username || '(unknown)' }}
                    <span class="text-gray-400 font-normal">{{ s.wins }} win{{ s.wins !== 1 ? 's' : '' }}</span>
                  </a>
                </div>
              </div>

              <!-- Shared IP users -->
              <div v-if="user.context.sharedIPUsers.length > 0">
                <h4 class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Accounts sharing an IP</h4>
                <div class="space-y-1">
                  <div
                    v-for="s in user.context.sharedIPUsers"
                    :key="s.userId"
                    class="flex items-center gap-2 text-xs"
                  >
                    <a
                      :href="`/admin/users?q=${s.username}`"
                      target="_blank"
                      class="text-indigo-700 hover:underline font-medium"
                    >{{ s.username || '(unknown)' }}</a>
                    <span class="text-gray-400">via {{ s.sharedIPs.join(', ') }}</span>
                  </div>
                </div>
              </div>

              <div
                v-if="user.context.topTradePartners.length === 0 && user.context.topAuctionSellers.length === 0 && user.context.sharedIPUsers.length === 0"
                class="text-xs text-gray-400"
              >No contextual data available for this user.</div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ── Rule Create / Edit Modal ─────────────────────────────────────── -->
    <div v-if="ruleModal.open" class="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl my-8">
        <div class="flex items-center justify-between p-4 border-b">
          <h2 class="font-semibold text-lg">{{ ruleModal.mode === 'create' ? 'New Rule' : 'Edit Rule' }}</h2>
          <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="closeRuleModal">×</button>
        </div>

        <div class="p-4 space-y-4">
          <!-- Name -->
          <div>
            <label class="block text-sm font-medium mb-1">Rule name <span class="text-red-500">*</span></label>
            <input v-model.trim="ruleForm.name" class="w-full border rounded px-3 py-2" placeholder="e.g. Alt Account Trade Funnel" />
          </div>

          <!-- Description -->
          <div>
            <label class="block text-sm font-medium mb-1">Description</label>
            <textarea v-model.trim="ruleForm.description" class="w-full border rounded px-3 py-2 text-sm" rows="2" placeholder="Explain what this rule is looking for…"></textarea>
          </div>

          <!-- Row: time window + condition logic + active toggle -->
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block text-sm font-medium mb-1">Time window</label>
              <select v-model="ruleForm.timeWindowDays" class="w-full border rounded px-3 py-2 text-sm">
                <option :value="null">All time</option>
                <option :value="7">Last 7 days</option>
                <option :value="14">Last 14 days</option>
                <option :value="30">Last 30 days</option>
                <option :value="60">Last 60 days</option>
                <option :value="90">Last 90 days</option>
                <option :value="180">Last 180 days</option>
                <option :value="365">Last 365 days</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Condition logic</label>
              <select v-model="ruleForm.conditionLogic" class="w-full border rounded px-3 py-2 text-sm">
                <option value="AND">AND — all conditions must match</option>
                <option value="OR">OR — any condition matches</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Active</label>
              <label class="flex items-center gap-2 mt-2.5 cursor-pointer">
                <input v-model="ruleForm.isActive" type="checkbox" class="rounded" />
                <span class="text-sm">{{ ruleForm.isActive ? 'Yes — included in analysis' : 'No — skipped' }}</span>
              </label>
            </div>
          </div>

          <!-- Conditions -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-sm font-medium">Conditions <span class="text-red-500">*</span></label>
              <button
                type="button"
                class="text-xs text-indigo-600 hover:underline"
                @click="addCondition"
              >+ Add condition</button>
            </div>

            <div v-if="ruleForm.conditions.length === 0" class="text-sm text-gray-400 border border-dashed rounded p-3 text-center">
              No conditions yet. Add at least one.
            </div>

            <div class="space-y-2">
              <div
                v-for="(cond, i) in ruleForm.conditions"
                :key="i"
                class="flex items-center gap-2 flex-wrap bg-gray-50 border rounded p-2"
              >
                <!-- Metric selector -->
                <div class="flex-1 min-w-[180px]">
                  <select v-model="cond.metric" class="w-full border rounded px-2 py-1.5 text-sm">
                    <option value="" disabled>Select metric…</option>
                    <optgroup v-for="cat in metricCategories" :key="cat.name" :label="cat.name">
                      <option v-for="m in cat.metrics" :key="m.key" :value="m.key">{{ m.label }}</option>
                    </optgroup>
                  </select>
                </div>

                <!-- Operator selector -->
                <div>
                  <select v-model="cond.operator" class="border rounded px-2 py-1.5 text-sm">
                    <option value="gt">is greater than</option>
                    <option value="gte">is ≥</option>
                    <option value="lt">is less than</option>
                    <option value="lte">is ≤</option>
                    <option value="eq">equals</option>
                  </select>
                </div>

                <!-- Threshold input -->
                <div class="w-24">
                  <input
                    v-model.number="cond.threshold"
                    type="number"
                    min="0"
                    step="any"
                    class="w-full border rounded px-2 py-1.5 text-sm"
                    placeholder="0"
                  />
                </div>

                <!-- Unit hint -->
                <span v-if="cond.metric" class="text-xs text-gray-400">{{ metricUnit(cond.metric) }}</span>

                <button
                  type="button"
                  class="text-red-400 hover:text-red-600 text-lg leading-none ml-auto"
                  @click="removeCondition(i)"
                >×</button>
              </div>
            </div>

            <!-- Human readable preview -->
            <div v-if="ruleForm.conditions.filter(c => c.metric).length > 0" class="mt-2 text-xs text-gray-500 bg-indigo-50 border border-indigo-100 rounded p-2">
              <span class="font-medium text-indigo-700">Preview: </span>
              Flag user if
              <span
                v-for="(cond, i) in ruleForm.conditions.filter(c => c.metric)"
                :key="i"
              ><span v-if="i > 0"> <span class="font-semibold text-indigo-600">{{ ruleForm.conditionLogic }}</span> </span><em>{{ metricLabel(cond.metric) }}</em> {{ operatorSymbol(cond.operator) }} {{ cond.threshold }}{{ metricUnit(cond.metric) }}</span>
            </div>
          </div>

          <!-- Metric reference -->
          <details class="text-xs">
            <summary class="cursor-pointer text-gray-500 hover:text-gray-700">Metric reference ▾</summary>
            <div class="mt-2 space-y-1">
              <div v-for="[key, def] in Object.entries(METRIC_DEFINITIONS)" :key="key" class="flex gap-2">
                <span class="font-mono text-indigo-600 flex-shrink-0">{{ key }}</span>
                <span class="text-gray-500">— {{ def.description }}</span>
              </div>
            </div>
          </details>

          <p v-if="ruleFormError" class="text-sm text-red-600">{{ ruleFormError }}</p>
        </div>

        <div class="flex justify-end gap-2 p-4 border-t">
          <button class="border rounded px-4 py-2 text-sm hover:bg-gray-50" @click="closeRuleModal">Cancel</button>
          <button
            class="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
            :disabled="ruleSaving"
            @click="saveRule"
          >{{ ruleSaving ? 'Saving…' : ruleModal.mode === 'create' ? 'Create Rule' : 'Save Changes' }}</button>
        </div>
      </div>
    </div>

    <!-- ── Mute Modal ──────────────────────────────────────────────────────── -->
    <div v-if="muteModal.open" class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div class="p-4 border-b flex items-center justify-between">
          <h2 class="font-semibold">Mute user from monitor</h2>
          <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="muteModal.open = false">×</button>
        </div>
        <div class="p-4 space-y-3">
          <p class="text-sm">
            Muting <strong>{{ muteModal.user?.username }}</strong> will hide them from the suspicious activity list
            (unless "Show muted users" is toggled on). They will still appear in all other admin tools.
          </p>
          <div>
            <label class="block text-sm font-medium mb-1">Reason (optional)</label>
            <textarea
              v-model.trim="muteReason"
              class="w-full border rounded px-3 py-2 text-sm"
              rows="2"
              placeholder="e.g. Investigated and confirmed legitimate activity"
            ></textarea>
          </div>
          <p v-if="muteError" class="text-sm text-red-600">{{ muteError }}</p>
        </div>
        <div class="flex justify-end gap-2 p-4 border-t">
          <button class="border rounded px-4 py-2 text-sm hover:bg-gray-50" @click="muteModal.open = false">Cancel</button>
          <button
            class="bg-orange-600 text-white px-4 py-2 rounded text-sm hover:bg-orange-700 disabled:opacity-50"
            :disabled="muteSaving"
            @click="confirmMute"
          >{{ muteSaving ? 'Muting…' : 'Mute User' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { METRIC_DEFINITIONS, OPERATOR_LABELS } from '~/server/utils/suspiciousActivityMetrics'

definePageMeta({ middleware: ['auth', 'admin'], layout: 'admin' })

// ── Rules state ────────────────────────────────────────────────────────────
const rules = ref([])
const rulesLoading = ref(false)

// ── Rule modal state ───────────────────────────────────────────────────────
const ruleModal = ref({ open: false, mode: 'create', editId: null })
const ruleForm = ref(emptyRuleForm())
const ruleFormError = ref('')
const ruleSaving = ref(false)

// ── Analysis state ─────────────────────────────────────────────────────────
const analysisResult = ref(null)
const analyzing = ref(false)
const analyzeError = ref('')
const showMuted = ref(false)
const expandedUsers = ref(new Set())

// ── Mute modal state ───────────────────────────────────────────────────────
const muteModal = ref({ open: false, user: null })
const muteReason = ref('')
const muteSaving = ref(false)
const muteError = ref('')

// ── Computed ───────────────────────────────────────────────────────────────
const displayedUsers = computed(() => {
  if (!analysisResult.value) return []
  const users = analysisResult.value.flaggedUsers
  return showMuted.value ? users : users.filter(u => !u.isMuted)
})

const rulesEvaluatedLabel = computed(() => {
  if (!analysisResult.value) return ''
  const n = analysisResult.value.rulesEvaluated
  return `${n} rule${n !== 1 ? 's' : ''} evaluated`
})

const lastRunLabel = computed(() => {
  if (!analysisResult.value) return ''
  const d = new Date(analysisResult.value.evaluatedAt)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  return d.toLocaleTimeString()
})

const metricCategories = computed(() => {
  const cats = {}
  for (const [key, def] of Object.entries(METRIC_DEFINITIONS)) {
    if (!cats[def.category]) cats[def.category] = { name: def.category, metrics: [] }
    cats[def.category].metrics.push({ key, label: def.label })
  }
  return Object.values(cats)
})

// ── Helpers ────────────────────────────────────────────────────────────────
function metricLabel(key) {
  return METRIC_DEFINITIONS[key]?.label ?? key
}

function metricUnit(key) {
  const u = METRIC_DEFINITIONS[key]?.unit
  if (!u) return ''
  return u === '%' ? '%' : ` ${u}`
}

function operatorLabel(op) {
  return OPERATOR_LABELS[op] ?? op
}

function operatorSymbol(op) {
  return { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=' }[op] ?? op
}

function emptyRuleForm() {
  return {
    name: '',
    description: '',
    isActive: true,
    timeWindowDays: 30,
    conditionLogic: 'AND',
    conditions: [],
  }
}

function addCondition() {
  ruleForm.value.conditions.push({ metric: '', operator: 'lte', threshold: 0 })
}

function removeCondition(i) {
  ruleForm.value.conditions.splice(i, 1)
}

// ── Data loading ───────────────────────────────────────────────────────────
async function loadRules() {
  rulesLoading.value = true
  try {
    const data = await $fetch('/api/admin/suspicious-activity/rules', { credentials: 'include' })
    rules.value = data
  } catch (e) {
    console.error('Failed to load rules', e)
  } finally {
    rulesLoading.value = false
  }
}

// ── Rule modal actions ─────────────────────────────────────────────────────
function openCreateRuleModal() {
  ruleForm.value = emptyRuleForm()
  ruleFormError.value = ''
  ruleModal.value = { open: true, mode: 'create', editId: null }
}

function openEditRuleModal(rule) {
  ruleForm.value = {
    name: rule.name,
    description: rule.description,
    isActive: rule.isActive,
    timeWindowDays: rule.timeWindowDays ?? null,
    conditionLogic: rule.conditionLogic,
    conditions: rule.conditions.map(c => ({ metric: c.metric, operator: c.operator, threshold: c.threshold })),
  }
  ruleFormError.value = ''
  ruleModal.value = { open: true, mode: 'edit', editId: rule.id }
}

function closeRuleModal() {
  ruleModal.value.open = false
}

async function saveRule() {
  ruleFormError.value = ''
  if (!ruleForm.value.name.trim()) {
    ruleFormError.value = 'Rule name is required.'
    return
  }
  const filledConditions = ruleForm.value.conditions.filter(c => c.metric)
  if (filledConditions.length === 0) {
    ruleFormError.value = 'At least one condition is required.'
    return
  }

  ruleSaving.value = true
  try {
    const payload = {
      name: ruleForm.value.name,
      description: ruleForm.value.description,
      isActive: ruleForm.value.isActive,
      timeWindowDays: ruleForm.value.timeWindowDays,
      conditionLogic: ruleForm.value.conditionLogic,
      conditions: filledConditions,
    }

    if (ruleModal.value.mode === 'create') {
      const newRule = await $fetch('/api/admin/suspicious-activity/rules', {
        method: 'POST',
        body: payload,
        credentials: 'include',
      })
      rules.value.push(newRule)
    } else {
      const updated = await $fetch(`/api/admin/suspicious-activity/rules/${ruleModal.value.editId}`, {
        method: 'PUT',
        body: payload,
        credentials: 'include',
      })
      const idx = rules.value.findIndex(r => r.id === ruleModal.value.editId)
      if (idx !== -1) rules.value[idx] = updated
    }
    closeRuleModal()
  } catch (e) {
    ruleFormError.value = e?.data?.statusMessage ?? e?.message ?? 'Failed to save rule.'
  } finally {
    ruleSaving.value = false
  }
}

async function deleteRule(rule) {
  if (!confirm(`Delete rule "${rule.name}"? This cannot be undone.`)) return
  try {
    await $fetch(`/api/admin/suspicious-activity/rules/${rule.id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    rules.value = rules.value.filter(r => r.id !== rule.id)
    // Clear analysis since rules changed
    analysisResult.value = null
  } catch (e) {
    alert(e?.data?.statusMessage ?? 'Failed to delete rule.')
  }
}

async function toggleRuleActive(rule) {
  try {
    const updated = await $fetch(`/api/admin/suspicious-activity/rules/${rule.id}`, {
      method: 'PUT',
      body: {
        name: rule.name,
        description: rule.description,
        isActive: !rule.isActive,
        timeWindowDays: rule.timeWindowDays,
        conditionLogic: rule.conditionLogic,
        conditions: rule.conditions.map(c => ({ metric: c.metric, operator: c.operator, threshold: c.threshold })),
      },
      credentials: 'include',
    })
    const idx = rules.value.findIndex(r => r.id === rule.id)
    if (idx !== -1) rules.value[idx] = updated
  } catch (e) {
    alert(e?.data?.statusMessage ?? 'Failed to update rule.')
  }
}

// ── Analysis ───────────────────────────────────────────────────────────────
async function runAnalysis() {
  analyzing.value = true
  analyzeError.value = ''
  expandedUsers.value = new Set()
  try {
    const data = await $fetch('/api/admin/suspicious-activity/analyze', {
      method: 'POST',
      credentials: 'include',
    })
    analysisResult.value = data
  } catch (e) {
    analyzeError.value = e?.data?.statusMessage ?? e?.message ?? 'Analysis failed.'
  } finally {
    analyzing.value = false
  }
}

function toggleExpand(userId) {
  const s = new Set(expandedUsers.value)
  if (s.has(userId)) s.delete(userId)
  else s.add(userId)
  expandedUsers.value = s
}

// ── Mute actions ───────────────────────────────────────────────────────────
function openMuteModal(user) {
  muteModal.value = { open: true, user }
  muteReason.value = ''
  muteError.value = ''
}

async function confirmMute() {
  muteError.value = ''
  muteSaving.value = true
  try {
    await $fetch('/api/admin/suspicious-activity/mutes', {
      method: 'POST',
      body: { userId: muteModal.value.user.userId, reason: muteReason.value || null },
      credentials: 'include',
    })
    // Update local state
    if (analysisResult.value) {
      const user = analysisResult.value.flaggedUsers.find(u => u.userId === muteModal.value.user.userId)
      if (user) {
        user.isMuted = true
        user.muteInfo = { reason: muteReason.value || null, mutedBy: 'you', mutedAt: new Date().toISOString() }
      }
    }
    muteModal.value.open = false
  } catch (e) {
    muteError.value = e?.data?.statusMessage ?? 'Failed to mute user.'
  } finally {
    muteSaving.value = false
  }
}

async function unmuteUser(user) {
  if (!confirm(`Unmute ${user.username}?`)) return
  try {
    await $fetch(`/api/admin/suspicious-activity/mutes/${user.userId}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (analysisResult.value) {
      const u = analysisResult.value.flaggedUsers.find(u => u.userId === user.userId)
      if (u) {
        u.isMuted = false
        u.muteInfo = null
      }
    }
  } catch (e) {
    alert(e?.data?.statusMessage ?? 'Failed to unmute user.')
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
onMounted(loadRules)
</script>
