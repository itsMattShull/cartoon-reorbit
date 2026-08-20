<template>
  <div class="admin-czone-contest">

    <!-- ── Header ─────────────────────────────────────────────────── -->
    <div class="acc-header">
      <h1 class="acc-title">cZone Contests</h1>
      <div class="acc-header-actions">
        <button class="acc-btn acc-btn--secondary" @click="openAutomation">
          ⚙ Weekly Automation
          <span v-if="automation.enabled" class="acc-badge acc-badge--green">ON</span>
          <span v-else class="acc-badge acc-badge--gray">OFF</span>
        </button>
        <button class="acc-btn acc-btn--primary" @click="openCreate">Create Contest</button>
      </div>
    </div>

    <div class="acc-toolbar">
      <label class="acc-checkbox-label">
        <input type="checkbox" v-model="showAll" @change="fetchContests" />
        Show past contests
      </label>
    </div>

    <!-- ── Toast ──────────────────────────────────────────────────── -->
    <div v-if="toast" :class="['acc-toast', `acc-toast--${toast.type}`]">{{ toast.msg }}</div>

    <!-- ── Contest list ───────────────────────────────────────────── -->
    <div v-if="loadingContests" class="acc-empty">Loading…</div>
    <div v-else-if="contests.length === 0" class="acc-empty">No contests found.</div>

    <div v-else class="acc-table-wrap">
      <table class="acc-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Start</th>
            <th>Subs End</th>
            <th>Voting Ends</th>
            <th>Subs</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in contests" :key="row.id">
            <td class="acc-td-name">{{ row.name }}</td>
            <td class="acc-td-date">{{ fmtDate(row.startDate) }}</td>
            <td class="acc-td-date">{{ fmtDate(row.endDate) }}</td>
            <td class="acc-td-date">{{ row.endVotingDate ? fmtDate(row.endVotingDate) : '—' }}</td>
            <td>{{ row._count.submissions }}</td>
            <td><span :class="statusClass(row)">{{ statusLabel(row) }}</span></td>
            <td>
              <div class="acc-actions">
                <NuxtLink :to="`/czone-contest/${row.id}`" class="acc-link acc-link--green" target="_blank">View</NuxtLink>
                <button class="acc-link acc-link--blue" @click="openEdit(row)">Edit</button>
                <button class="acc-link acc-link--red" @click="confirmDelete(row)">Delete</button>
                <button
                  class="acc-link"
                  :class="(row.distributedAt || isVotingOpen(row)) ? 'acc-link--disabled' : 'acc-link--amber'"
                  :disabled="!!row.distributedAt || isVotingOpen(row)"
                  :title="isVotingOpen(row) ? 'Cannot distribute until voting ends' : ''"
                  @click="openDistribute(row)"
                >{{ row.distributedAt ? 'Distributed' : 'Distribute' }}</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Create / Edit Modal ────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showFormModal" class="acc-overlay" @click.self="closeFormModal">
        <div class="acc-modal">
          <div class="acc-modal-head">
            <span>{{ editingContest ? 'Edit Contest' : 'Create Contest' }}</span>
            <button class="acc-modal-close" @click="closeFormModal">✕</button>
          </div>
          <div class="acc-modal-body">
            <div class="acc-field">
              <label>Contest Name</label>
              <input v-model="form.name" class="acc-input" placeholder="Spring cZone Showdown" />
            </div>
            <div class="acc-grid-2">
              <div class="acc-field">
                <label>Start Date</label>
                <input v-model="form.startDate" type="datetime-local" class="acc-input" />
              </div>
              <div class="acc-field">
                <label>Submission End Date</label>
                <input v-model="form.endDate" type="datetime-local" class="acc-input" />
              </div>
            </div>
            <div class="acc-field">
              <label>Voting End Date <span class="acc-hint">(optional)</span></label>
              <input v-model="form.endVotingDate" type="datetime-local" class="acc-input" />
              <p class="acc-help">If set, voting opens after submission end and closes here.</p>
            </div>
            <div class="acc-field">
              <label>Max Votes Per User</label>
              <input v-model.number="form.maxVotesPerUser" type="number" min="1" class="acc-input" />
            </div>
            <div class="acc-field">
              <p class="acc-label-bold">Winner Prizes</p>
              <PrizeBuilder v-model="form.winnerPrizes" :ctoon-options="ctoonOptions" :bg-options="bgOptions" />
            </div>
            <div class="acc-field">
              <p class="acc-label-bold">Participant Prizes</p>
              <PrizeBuilder v-model="form.participantPrizes" :ctoon-options="ctoonOptions" :bg-options="bgOptions" />
            </div>
            <p v-if="formError" class="acc-error">{{ formError }}</p>
          </div>
          <div class="acc-modal-foot">
            <button class="acc-btn acc-btn--ghost" @click="closeFormModal">Cancel</button>
            <button class="acc-btn acc-btn--primary" :disabled="formSaving" @click="saveForm">
              {{ formSaving ? 'Saving…' : (editingContest ? 'Save Changes' : 'Create') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Delete Confirmation Modal ──────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showDeleteModal" class="acc-overlay" @click.self="showDeleteModal = false">
        <div class="acc-modal acc-modal--sm">
          <div class="acc-modal-head">
            <span>Delete Contest</span>
            <button class="acc-modal-close" @click="showDeleteModal = false">✕</button>
          </div>
          <div class="acc-modal-body">
            <p class="acc-body-text">
              Delete <strong>{{ deletingContest?.name }}</strong>? This removes all submissions and votes.
            </p>
          </div>
          <div class="acc-modal-foot">
            <button class="acc-btn acc-btn--ghost" @click="showDeleteModal = false">Cancel</button>
            <button class="acc-btn acc-btn--danger" :disabled="deleteSaving" @click="doDelete">
              {{ deleteSaving ? 'Deleting…' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Distribute Prizes Modal ────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showDistributeModal" class="acc-overlay" @click.self="closeDistributeModal">
        <div class="acc-modal">
          <div class="acc-modal-head">
            <span>Distribute — {{ distributingContest?.name }}</span>
            <button class="acc-modal-close" @click="closeDistributeModal">✕</button>
          </div>
          <div class="acc-modal-body">
            <div v-if="leaderboardLoading" class="acc-empty">Loading leaderboard…</div>
            <div v-else-if="leaderboard.length === 0" class="acc-empty">No submissions yet.</div>
            <template v-else>
              <p class="acc-help acc-mb-2">Select the winner, then click Distribute.</p>
              <div class="acc-leaderboard">
                <label
                  v-for="(sub, i) in leaderboard"
                  :key="sub.id"
                  class="acc-leaderboard-row"
                  :class="{ 'acc-leaderboard-row--selected': selectedWinnerId === sub.id }"
                >
                  <input type="radio" v-model="selectedWinnerId" :value="sub.id" />
                  <img :src="sub.imageUrl" class="acc-leaderboard-img" />
                  <div class="acc-leaderboard-info">
                    <div class="acc-leaderboard-name">{{ sub.username }}</div>
                    <div class="acc-leaderboard-meta">Zone {{ sub.zoneIndex + 1 }} · {{ sub.voteCount }} votes</div>
                  </div>
                  <span v-if="i === 0" class="acc-badge acc-badge--gold">#1</span>
                </label>
              </div>
              <p v-if="distributeError" class="acc-error acc-mt-2">{{ distributeError }}</p>
            </template>
          </div>
          <div class="acc-modal-foot">
            <button class="acc-btn acc-btn--ghost" @click="closeDistributeModal">Cancel</button>
            <button
              class="acc-btn acc-btn--amber"
              :disabled="!selectedWinnerId || distributeSaving"
              @click="doDistribute"
            >{{ distributeSaving ? 'Distributing…' : 'Distribute Prizes' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Weekly Automation Modal ────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showAutomationModal" class="acc-overlay" @click.self="closeAutomationModal">
        <div class="acc-modal acc-modal--lg">
          <div class="acc-modal-head">
            <span>Weekly cZone Contest Automation</span>
            <button class="acc-modal-close" @click="closeAutomationModal">✕</button>
          </div>
          <div class="acc-modal-body">

            <!-- Enable toggle -->
            <div class="acc-automation-enable">
              <label class="acc-toggle-label">
                <span class="acc-toggle-wrap">
                  <input type="checkbox" v-model="autoForm.enabled" class="acc-toggle-input" />
                  <span class="acc-toggle-track"></span>
                </span>
                <span class="acc-toggle-text">
                  {{ autoForm.enabled ? 'Enabled — contests will be created automatically' : 'Disabled — no automatic contests' }}
                </span>
              </label>
            </div>

            <div class="acc-section-divider"></div>

            <!-- Schedule section -->
            <p class="acc-section-label">Schedule (all times CST/CDT)</p>

            <div class="acc-auto-row">
              <span class="acc-auto-row-label">Contest starts</span>
              <div class="acc-auto-row-fields">
                <select v-model.number="autoForm.startDayOfWeek" class="acc-select">
                  <option v-for="(d, i) in DAY_NAMES" :key="i" :value="i">{{ d }}</option>
                </select>
                <span class="acc-at">at</span>
                <input v-model.number="autoForm.startHour" type="number" min="0" max="23" class="acc-input acc-input--sm" />
                <span class="acc-colon">:</span>
                <input v-model.number="autoForm.startMinute" type="number" min="0" max="59" class="acc-input acc-input--sm" />
                <span class="acc-cst">CST</span>
              </div>
            </div>

            <div class="acc-auto-row">
              <span class="acc-auto-row-label">Submissions end</span>
              <div class="acc-auto-row-fields">
                <select v-model.number="autoForm.submissionEndDayOfWeek" class="acc-select">
                  <option v-for="(d, i) in DAY_NAMES" :key="i" :value="i">{{ d }}</option>
                </select>
                <span class="acc-at">at</span>
                <input v-model.number="autoForm.submissionEndHour" type="number" min="0" max="23" class="acc-input acc-input--sm" />
                <span class="acc-colon">:</span>
                <input v-model.number="autoForm.submissionEndMinute" type="number" min="0" max="59" class="acc-input acc-input--sm" />
                <span class="acc-cst">CST</span>
              </div>
            </div>

            <div class="acc-auto-row">
              <span class="acc-auto-row-label">Voting ends</span>
              <div class="acc-auto-row-fields">
                <select v-model.number="autoForm.votingEndDayOfWeek" class="acc-select">
                  <option v-for="(d, i) in DAY_NAMES" :key="i" :value="i">{{ d }}</option>
                </select>
                <span class="acc-at">at</span>
                <input v-model.number="autoForm.votingEndHour" type="number" min="0" max="23" class="acc-input acc-input--sm" />
                <span class="acc-colon">:</span>
                <input v-model.number="autoForm.votingEndMinute" type="number" min="0" max="59" class="acc-input acc-input--sm" />
                <span class="acc-cst">CST</span>
              </div>
            </div>

            <div class="acc-section-divider"></div>

            <!-- Prize defaults -->
            <p class="acc-section-label">Default Prizes</p>
            <p class="acc-help acc-mb-2">
              Auto-created contests start with these point prizes. You can edit any contest later to add cToons or backgrounds.
            </p>

            <div class="acc-grid-2">
              <div class="acc-field">
                <label>Winner Points</label>
                <input v-model.number="autoForm.winnerPoints" type="number" min="0" max="10000" class="acc-input" />
              </div>
              <div class="acc-field">
                <label>Participant Points</label>
                <input v-model.number="autoForm.participantPoints" type="number" min="0" max="10000" class="acc-input" />
              </div>
            </div>

            <div class="acc-grid-2">
              <div class="acc-field">
                <label>Max Votes Per User</label>
                <input v-model.number="autoForm.maxVotesPerUser" type="number" min="1" max="100" class="acc-input" />
              </div>
            </div>

            <div class="acc-section-divider"></div>

            <!-- Title template -->
            <p class="acc-section-label">Title Template</p>
            <div class="acc-field">
              <label>Template <span class="acc-hint">(use <code>{startDate}</code> for the start date)</span></label>
              <input v-model="autoForm.titleTemplate" class="acc-input" placeholder="Weekly cZone Contest {startDate}" />
            </div>

            <!-- Preview -->
            <div class="acc-preview-box">
              <p class="acc-preview-label">Preview</p>
              <p class="acc-preview-title">{{ previewTitle }}</p>
              <div class="acc-preview-dates">
                <div><span class="acc-preview-key">Start:</span> {{ previewStartLabel }}</div>
                <div><span class="acc-preview-key">Subs end:</span> {{ previewSubsLabel }}</div>
                <div><span class="acc-preview-key">Voting ends:</span> {{ previewVotingLabel }}</div>
              </div>
            </div>

            <!-- Last created info -->
            <p v-if="automation.lastCreatedFor" class="acc-help acc-mt-2">
              Last auto-created for week of <strong>{{ automation.lastCreatedFor }}</strong>.
            </p>

            <p v-if="autoError" class="acc-error acc-mt-2">{{ autoError }}</p>
          </div>
          <div class="acc-modal-foot">
            <button class="acc-btn acc-btn--ghost" @click="closeAutomationModal">Cancel</button>
            <button class="acc-btn acc-btn--primary" :disabled="autoSaving" @click="saveAutomation">
              {{ autoSaving ? 'Saving…' : 'Save Automation Settings' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ── Contest list ─────────────────────────────────────────────────────────────
const contests        = ref([])
const loadingContests = ref(false)
const showAll         = ref(false)
const toast           = ref(null)
let toastTimer = null

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
})
const ctoonOptions    = ref([])
const bgOptions       = ref([])

// ── Create / Edit form ───────────────────────────────────────────────────────
const showFormModal  = ref(false)
const editingContest = ref(null)
const formSaving     = ref(false)
const formError      = ref('')

function emptyPrizes() { return { ctoons: [], backgroundIds: [], points: 0 } }

const form = ref({
  name: '', startDate: '', endDate: '', endVotingDate: '',
  maxVotesPerUser: 5,
  winnerPrizes: emptyPrizes(), participantPrizes: emptyPrizes(),
})

// ── Delete ───────────────────────────────────────────────────────────────────
const showDeleteModal  = ref(false)
const deletingContest  = ref(null)
const deleteSaving     = ref(false)

// ── Distribute ───────────────────────────────────────────────────────────────
const showDistributeModal  = ref(false)
const distributingContest  = ref(null)
const leaderboard          = ref([])
const leaderboardLoading   = ref(false)
const selectedWinnerId     = ref(null)
const distributeSaving     = ref(false)
const distributeError      = ref('')

// ── Automation ───────────────────────────────────────────────────────────────
const showAutomationModal = ref(false)
const autoSaving          = ref(false)
const autoError           = ref('')
const automation          = ref({
  enabled: false,
  startDayOfWeek: 6, startHour: 8, startMinute: 0,
  submissionEndDayOfWeek: 1, submissionEndHour: 20, submissionEndMinute: 0,
  votingEndDayOfWeek: 3, votingEndHour: 8, votingEndMinute: 0,
  winnerPoints: 1000, participantPoints: 250,
  titleTemplate: 'Weekly cZone Contest {startDate}',
  maxVotesPerUser: 5,
  lastCreatedFor: null,
})

const autoForm = ref({ ...automation.value })

// ── Helpers ──────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  toast.value = { msg, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null; toastTimer = null }, 3500)
}

function fmtDate(dt) {
  return new Date(dt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function toDatetimeLocal(dt) {
  if (!dt) return ''
  const d = new Date(dt)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function isVotingOpen(row) {
  if (!row.endVotingDate) return false
  return new Date(row.endVotingDate) > new Date()
}

function statusLabel(row) {
  if (row.distributedAt) return 'Ended'
  const now = new Date()
  if (new Date(row.startDate) > now) return 'Upcoming'
  if (new Date(row.endDate) < now) {
    if (row.endVotingDate && new Date(row.endVotingDate) >= now) return 'Voting Open'
    return 'Past'
  }
  return 'Active'
}

function statusClass(row) {
  return {
    Active:       'acc-status acc-status--green',
    Upcoming:     'acc-status acc-status--blue',
    'Voting Open':'acc-status acc-status--purple',
    Past:         'acc-status acc-status--gray',
    Ended:        'acc-status acc-status--amber',
  }[statusLabel(row)] || 'acc-status'
}

// ── Preview computations for automation modal ────────────────────────────────
function formatDayTime(dow, hour, minute) {
  return `${DAY_NAMES[dow]} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} CST`
}

const previewStartLabel   = computed(() => formatDayTime(autoForm.value.startDayOfWeek, autoForm.value.startHour, autoForm.value.startMinute))
const previewSubsLabel    = computed(() => formatDayTime(autoForm.value.submissionEndDayOfWeek, autoForm.value.submissionEndHour, autoForm.value.submissionEndMinute))
const previewVotingLabel  = computed(() => formatDayTime(autoForm.value.votingEndDayOfWeek, autoForm.value.votingEndHour, autoForm.value.votingEndMinute))

const previewTitle = computed(() => {
  const tpl = autoForm.value.titleTemplate || 'Weekly cZone Contest {startDate}'
  const dayName = DAY_NAMES[autoForm.value.startDayOfWeek] || 'Saturday'
  return tpl.replace('{startDate}', `next ${dayName}`)
})

// ── API calls — contests ─────────────────────────────────────────────────────
async function fetchContests() {
  loadingContests.value = true
  try {
    contests.value = await $fetch(`/api/admin/czone-contest?showAll=${showAll.value}`)
  } catch (e) {
    showToast(e?.data?.statusMessage || 'Failed to load contests', 'error')
  } finally {
    loadingContests.value = false
  }
}

function openCreate() {
  editingContest.value = null
  form.value = { name: '', startDate: '', endDate: '', endVotingDate: '', maxVotesPerUser: 5, winnerPrizes: emptyPrizes(), participantPrizes: emptyPrizes() }
  formError.value = ''
  showFormModal.value = true
}

function openEdit(row) {
  editingContest.value = row
  form.value = {
    name: row.name,
    startDate: toDatetimeLocal(row.startDate),
    endDate: toDatetimeLocal(row.endDate),
    endVotingDate: toDatetimeLocal(row.endVotingDate),
    maxVotesPerUser: row.maxVotesPerUser,
    winnerPrizes: JSON.parse(JSON.stringify(row.winnerPrizes || emptyPrizes())),
    participantPrizes: JSON.parse(JSON.stringify(row.participantPrizes || emptyPrizes())),
  }
  formError.value = ''
  showFormModal.value = true
}

function closeFormModal() {
  showFormModal.value = false
  editingContest.value = null
}

async function saveForm() {
  formError.value = ''
  if (!form.value.name.trim())            { formError.value = 'Name is required'; return }
  if (!form.value.startDate || !form.value.endDate) { formError.value = 'Both dates are required'; return }
  if (new Date(form.value.startDate) >= new Date(form.value.endDate)) { formError.value = 'Submission End Date must be after start date'; return }
  if (form.value.endVotingDate && new Date(form.value.endVotingDate) <= new Date(form.value.endDate)) {
    formError.value = 'Voting End Date must be after Submission End Date'; return
  }

  formSaving.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      startDate: new Date(form.value.startDate).toISOString(),
      endDate:   new Date(form.value.endDate).toISOString(),
      endVotingDate: form.value.endVotingDate ? new Date(form.value.endVotingDate).toISOString() : null,
      maxVotesPerUser: form.value.maxVotesPerUser,
      winnerPrizes: form.value.winnerPrizes,
      participantPrizes: form.value.participantPrizes,
    }
    if (editingContest.value) {
      await $fetch(`/api/admin/czone-contest/${editingContest.value.id}`, { method: 'PUT', body: payload })
      showToast('Contest updated')
    } else {
      await $fetch('/api/admin/czone-contest', { method: 'POST', body: payload })
      showToast('Contest created')
    }
    closeFormModal()
    await fetchContests()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Save failed'
  } finally {
    formSaving.value = false
  }
}

function confirmDelete(row) {
  deletingContest.value = row
  showDeleteModal.value = true
}

async function doDelete() {
  deleteSaving.value = true
  try {
    await $fetch(`/api/admin/czone-contest/${deletingContest.value.id}`, { method: 'DELETE' })
    showToast('Contest deleted')
    showDeleteModal.value = false
    deletingContest.value = null
    await fetchContests()
  } catch (e) {
    showToast(e?.data?.statusMessage || 'Delete failed', 'error')
  } finally {
    deleteSaving.value = false
  }
}

async function openDistribute(row) {
  distributingContest.value = row
  selectedWinnerId.value = null
  distributeError.value = ''
  leaderboard.value = []
  showDistributeModal.value = true
  leaderboardLoading.value = true
  try {
    const data = await $fetch(`/api/admin/czone-contest/${row.id}/leaderboard`)
    leaderboard.value = data.submissions
  } catch (e) {
    distributeError.value = e?.data?.statusMessage || 'Failed to load leaderboard'
  } finally {
    leaderboardLoading.value = false
  }
}

function closeDistributeModal() {
  showDistributeModal.value = false
  distributingContest.value = null
}

async function doDistribute() {
  if (!selectedWinnerId.value) return
  distributeError.value = ''
  distributeSaving.value = true
  try {
    await $fetch(`/api/admin/czone-contest/${distributingContest.value.id}/distribute`, {
      method: 'POST',
      body: { winnerId: selectedWinnerId.value },
    })
    showToast('Prizes distributed successfully!')
    closeDistributeModal()
    await fetchContests()
  } catch (e) {
    distributeError.value = e?.data?.statusMessage || 'Distribution failed'
  } finally {
    distributeSaving.value = false
  }
}

// ── API calls — automation ───────────────────────────────────────────────────
async function fetchAutomation() {
  try {
    const data = await $fetch('/api/admin/czone-contest-automation')
    automation.value = data
  } catch {}
}

function openAutomation() {
  autoForm.value = { ...automation.value }
  autoError.value = ''
  showAutomationModal.value = true
}

function closeAutomationModal() {
  showAutomationModal.value = false
}

async function saveAutomation() {
  autoError.value = ''
  autoSaving.value = true
  try {
    const saved = await $fetch('/api/admin/czone-contest-automation', {
      method: 'PUT',
      body: autoForm.value,
    })
    automation.value = saved
    showToast('Automation settings saved')
    closeAutomationModal()
  } catch (e) {
    autoError.value = e?.data?.statusMessage || 'Failed to save automation settings'
  } finally {
    autoSaving.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    fetchContests(),
    fetchAutomation(),
    $fetch('/api/admin/list-ctoons').then(d => { ctoonOptions.value = d }).catch(() => {}),
    $fetch('/api/admin/list-backgrounds').then(d => { bgOptions.value = d }).catch(() => {}),
  ])
})
</script>

<style scoped>
/* The newsite layout sets `color: #ffffff` on <body>, and this section used to
   compound that by styling itself for a dark backdrop it doesn't actually sit
   on — the panel (.newsite-admin-body) is light. Opt out the same way the other
   modern admin sections do (see AdminCMoon.vue), or text renders white-on-white. */
.admin-czone-contest {
  padding: 12px;
  box-sizing: border-box;
  color: #111827;
  font-size: 0.8rem;
  min-height: 100%;
  color-scheme: light;
}

/* Native controls (inputs/selects/textareas) also need an explicit opt-out so
   iOS/macOS dark mode doesn't repaint them dark despite color-scheme above. */
.admin-czone-contest input:not([type='checkbox']):not([type='radio']),
.admin-czone-contest select,
.admin-czone-contest textarea {
  color: #111827;
  -webkit-text-fill-color: #111827;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.acc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.acc-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0;
  color: #111827;
}
.acc-header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.acc-toolbar {
  margin-bottom: 10px;
}
.acc-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  color: #374151;
}

/* ── Toast ──────────────────────────────────────────────────────────────── */
.acc-toast {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
.acc-toast--success { background: #16a34a; color: #fff; }
.acc-toast--error   { background: #dc2626; color: #fff; }

/* ── Buttons ────────────────────────────────────────────────────────────── */
.acc-btn {
  border: none;
  border-radius: 5px;
  padding: 5px 12px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.acc-btn--primary  { background: #2563eb; color: #fff; }
.acc-btn--primary:hover:not(:disabled) { background: #1d4ed8; }
.acc-btn--secondary { background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
.acc-btn--secondary:hover { background: #e5e7eb; }
.acc-btn--ghost { background: #fff; color: #374151; border: 1px solid #d1d5db; }
.acc-btn--ghost:hover { background: #f9fafb; }
.acc-btn--danger  { background: #dc2626; color: #fff; }
.acc-btn--danger:hover:not(:disabled) { background: #b91c1c; }
.acc-btn--amber   { background: #d97706; color: #fff; }
.acc-btn--amber:hover:not(:disabled) { background: #b45309; }
.acc-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Badges ─────────────────────────────────────────────────────────────── */
.acc-badge {
  font-size: 0.65rem;
  padding: 1px 5px;
  border-radius: 20px;
  font-weight: 700;
}
.acc-badge--green { background: #16a34a; color: #fff; }
.acc-badge--gray  { background: #6b7280; color: #fff; }
.acc-badge--gold  { background: #f59e0b; color: #78350f; }

/* ── Status chips ───────────────────────────────────────────────────────── */
.acc-status {
  display: inline-block;
  font-size: 0.7rem;
  padding: 2px 7px;
  border-radius: 20px;
  font-weight: 600;
}
.acc-status--green  { background: #dcfce7; color: #15803d; }
.acc-status--blue   { background: #dbeafe; color: #1d4ed8; }
.acc-status--purple { background: #ede9fe; color: #6d28d9; }
.acc-status--gray   { background: #f3f4f6; color: #4b5563; }
.acc-status--amber  { background: #fef3c7; color: #b45309; }

/* ── Table ──────────────────────────────────────────────────────────────── */
.acc-table-wrap {
  overflow-x: auto;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #fff;
}
.acc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}
.acc-table th {
  background: #f9fafb;
  color: #6b7280;
  text-align: left;
  padding: 7px 10px;
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 1px solid #e5e7eb;
}
.acc-table td {
  padding: 7px 10px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
  color: #111827;
}
.acc-table tr:last-child td { border-bottom: none; }
.acc-table tr:hover td { background: #f9fafb; }
.acc-td-name { font-weight: 600; max-width: 200px; }
.acc-td-date { white-space: nowrap; color: #4b5563; }

.acc-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.acc-link {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0;
  text-decoration: none;
}
.acc-link--green  { color: #16a34a; }
.acc-link--blue   { color: #2563eb; }
.acc-link--red    { color: #dc2626; }
.acc-link--amber  { color: #b45309; }
.acc-link--disabled { color: #9ca3af; cursor: not-allowed; }
.acc-link:not(.acc-link--disabled):hover { text-decoration: underline; }

.acc-empty {
  color: #6b7280;
  padding: 20px 0;
  text-align: center;
}

/* ── Modals ─────────────────────────────────────────────────────────────── */
.acc-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.65);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.acc-modal {
  background: #fff;
  color: #111827;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  width: 100%;
  max-width: 560px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.35);
}
.acc-modal--sm { max-width: 400px; }
.acc-modal--lg { max-width: 680px; }

.acc-modal-head {
  padding: 14px 16px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  font-size: 0.95rem;
  flex-shrink: 0;
  color: #111827;
}
.acc-modal-close {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 1rem;
  cursor: pointer;
  line-height: 1;
}
.acc-modal-close:hover { color: #111827; }

.acc-modal-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}
.acc-modal-foot {
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

/* ── Form elements ──────────────────────────────────────────────────────── */
.acc-field {
  margin-bottom: 12px;
}
.acc-field label, .acc-label-bold {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 4px;
}
.acc-input {
  width: 100%;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  color: #111827;
  padding: 6px 10px;
  font-size: 0.8rem;
  box-sizing: border-box;
}
.acc-input:focus { outline: none; border-color: #2563eb; }
.acc-input--sm { width: 56px; text-align: center; }
.acc-select {
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  color: #111827;
  padding: 5px 8px;
  font-size: 0.8rem;
}
.acc-select option { background: #fff; color: #111827; }
.acc-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
}
.acc-help {
  font-size: 0.72rem;
  color: #6b7280;
  margin: 0;
}
.acc-hint { color: #9ca3af; font-weight: 400; }
.acc-hint code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 0.7rem; }
.acc-error {
  color: #dc2626;
  font-size: 0.75rem;
  margin-top: 4px;
}
.acc-body-text { color: #374151; line-height: 1.5; }

/* ── Leaderboard ────────────────────────────────────────────────────────── */
.acc-leaderboard { display: flex; flex-direction: column; gap: 6px; }
.acc-leaderboard-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
}
.acc-leaderboard-row:hover { background: #f9fafb; }
.acc-leaderboard-row--selected { border-color: #2563eb; background: #eff6ff; }
.acc-leaderboard-img { width: 64px; height: 48px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
.acc-leaderboard-info { flex: 1; min-width: 0; }
.acc-leaderboard-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.acc-leaderboard-meta { font-size: 0.7rem; color: #6b7280; }

/* ── Automation modal ───────────────────────────────────────────────────── */
.acc-automation-enable {
  padding: 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  margin-bottom: 12px;
}
.acc-toggle-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}
.acc-toggle-wrap { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
.acc-toggle-input { opacity: 0; width: 0; height: 0; position: absolute; }
.acc-toggle-track {
  position: absolute;
  inset: 0;
  background: #374151;
  border-radius: 20px;
  transition: background 0.2s;
}
.acc-toggle-track::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 3px;
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}
.acc-toggle-input:checked ~ .acc-toggle-track { background: #16a34a; }
.acc-toggle-input:checked ~ .acc-toggle-track::after { transform: translateX(16px); }
.acc-toggle-text { font-size: 0.8rem; color: #374151; }

.acc-section-divider { height: 1px; background: #e5e7eb; margin: 14px 0; }
.acc-section-label { font-size: 0.72rem; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 10px; }

.acc-auto-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.acc-auto-row-label {
  width: 130px;
  font-size: 0.78rem;
  color: #374151;
  flex-shrink: 0;
}
.acc-auto-row-fields {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.acc-at, .acc-cst { color: #9ca3af; font-size: 0.75rem; }
.acc-colon { color: #6b7280; font-weight: 700; }

.acc-preview-box {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 10px 12px;
  margin-top: 12px;
}
.acc-preview-label { font-size: 0.68rem; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 6px; }
.acc-preview-title { font-size: 0.88rem; font-weight: 700; color: #111827; margin: 0 0 8px; }
.acc-preview-dates { display: flex; flex-direction: column; gap: 3px; font-size: 0.75rem; color: #4b5563; }
.acc-preview-key { color: #9ca3af; margin-right: 4px; }

.acc-mb-2 { margin-bottom: 8px !important; }
.acc-mt-2 { margin-top: 8px !important; }
</style>
