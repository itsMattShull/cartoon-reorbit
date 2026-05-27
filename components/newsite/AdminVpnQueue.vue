<template>
  <div class="vpn-monitor">

    <!-- Header -->
    <div class="monitor-header">
      <div>
        <h1 class="monitor-title">VPN Queue Monitor</h1>
        <p class="monitor-sub">Status of the VPN IP check queue and recent activity</p>
      </div>
      <div class="header-actions">
        <label class="auto-refresh-toggle">
          <input type="checkbox" v-model="autoRefresh" />
          Auto-refresh (10s)
        </label>
        <button class="btn-refresh" @click="load" :disabled="loading">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <template v-if="data">

      <!-- Queue status banner -->
      <div class="status-banner" :class="data.queue.pending > 0 ? 'status-running' : 'status-idle'">
        <div class="status-left">
          <svg v-if="data.queue.pending > 0" class="spin-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="spin-track" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="spin-fill" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          <svg v-else class="check-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
          </svg>
          <span class="status-label">
            {{ data.queue.pending > 0 ? `Processing — ${data.queue.pending} IPs pending` : 'Queue idle' }}
          </span>
          <span v-if="data.queue.pending > 0" class="status-eta">
            ~{{ data.queue.estimatedMinutes }} min remaining at 20/min
          </span>
        </div>
        <span class="status-time">Refreshed {{ lastRefreshed }}</span>
      </div>

      <!-- Stats cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Total Checked</div>
          <div class="stat-value">{{ data.db.totalChecked.toLocaleString() }}</div>
          <div class="stat-sub">all time</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">VPN Flagged</div>
          <div class="stat-value stat-red">{{ data.db.totalFlagged.toLocaleString() }}</div>
          <div class="stat-sub">all time</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Checked Today</div>
          <div class="stat-value">{{ data.db.checkedToday.toLocaleString() }}</div>
          <div class="stat-sub">since midnight</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Flagged Today</div>
          <div class="stat-value" :class="data.db.flaggedToday > 0 ? 'stat-red' : ''">
            {{ data.db.flaggedToday.toLocaleString() }}
          </div>
          <div class="stat-sub">since midnight</div>
        </div>
      </div>

      <!-- Session note -->
      <div class="session-note">
        <strong>This session (since last restart):</strong>
        {{ data.queue.processedThisSession.toLocaleString() }} IPs processed,
        {{ data.queue.flaggedThisSession.toLocaleString() }} flagged
      </div>

      <!-- Error log + Recent activity (side by side) -->
      <div class="panels">

        <!-- Error log -->
        <div class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-title">Queue Errors</div>
              <div class="panel-sub">In-memory · resets on server restart</div>
            </div>
            <span class="error-badge" :class="data.errors.length > 0 ? 'badge-red' : 'badge-green'">
              {{ data.errors.length > 0 ? data.errors.length : 'None' }}
            </span>
          </div>
          <div v-if="data.errors.length > 0" class="panel-scroll">
            <div v-for="err in data.errors" :key="err.ts + err.userId" class="error-row">
              <div class="error-time">{{ fmtDate(err.ts) }}</div>
              <div class="error-msg">{{ err.message }}</div>
              <div class="error-meta">
                user: {{ err.userId?.slice(0, 8) }}… · ip: {{ err.encryptedIp?.slice(0, 16) }}…
              </div>
            </div>
          </div>
          <div v-else class="panel-empty">No errors recorded</div>
        </div>

        <!-- Recent activity -->
        <div class="panel panel-wide">
          <div class="panel-header">
            <div>
              <div class="panel-title">Recent Activity</div>
              <div class="panel-sub">Last 50 IPs checked, most recent first</div>
            </div>
          </div>
          <div v-if="data.recentActivity.length > 0" class="panel-scroll">
            <div v-for="entry in data.recentActivity" :key="entry.id" class="activity-row">
              <span class="vpn-pill" :class="entry.isVpn ? 'pill-vpn' : 'pill-clean'">
                {{ entry.isVpn ? 'VPN' : 'Clean' }}
              </span>
              <span class="activity-user">
                {{ entry.user?.username || entry.user?.discordTag || entry.userId?.slice(0, 8) + '…' }}
              </span>
              <span class="activity-ip" :title="entry.ip">{{ entry.ip.slice(0, 18) }}…</span>
              <span v-if="entry.proxyType" class="activity-type">{{ entry.proxyType }}</span>
              <span v-if="entry.isp" class="activity-isp">{{ entry.isp }}</span>
              <span v-if="entry.country" class="activity-country">{{ entry.country }}</span>
              <span class="activity-time">{{ fmtDate(entry.detectedAt) }}</span>
            </div>
          </div>
          <div v-else class="panel-empty">No activity yet</div>
        </div>

      </div>

    </template>
  </div>
</template>

<script setup>
const data = ref(null)
const loading = ref(false)
const error = ref(null)
const autoRefresh = ref(true)
const lastRefreshed = ref('—')
let refreshTimer = null

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await $fetch('/api/admin/vpn-queue-status')
    lastRefreshed.value = new Date().toLocaleTimeString()
  } catch (e) {
    error.value = e?.data?.statusMessage || e?.message || 'Failed to load status'
  } finally {
    loading.value = false
  }
}

function fmtDate(val) {
  if (!val) return '—'
  return new Date(val).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

watch(autoRefresh, (val) => {
  clearInterval(refreshTimer)
  if (val) refreshTimer = setInterval(load, 10_000)
})

onMounted(() => {
  load()
  refreshTimer = setInterval(load, 10_000)
})

onUnmounted(() => {
  clearInterval(refreshTimer)
})
</script>

<style scoped>
.vpn-monitor {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #fff;
  font-family: var(--font-family, 'Nunito', sans-serif);
  overflow-y: auto;
  height: 100%;
  box-sizing: border-box;
}

/* Header */
.monitor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.monitor-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
}
.monitor-sub {
  font-size: 0.75rem;
  opacity: 0.65;
  margin: 2px 0 0;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.auto-refresh-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  opacity: 0.8;
  cursor: pointer;
}
.btn-refresh {
  padding: 5px 14px;
  font-size: 0.8rem;
  font-family: inherit;
  background: var(--OrbitLightBlue, #3399CC);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}
.btn-refresh:hover { opacity: 0.85; }
.btn-refresh:disabled { opacity: 0.45; cursor: not-allowed; }

/* Error banner */
.error-banner {
  background: rgba(220, 38, 38, 0.2);
  border: 1px solid rgba(220, 38, 38, 0.5);
  color: #fca5a5;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.85rem;
}

/* Status banner */
.status-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.85rem;
}
.status-running {
  background: rgba(51, 153, 204, 0.2);
  border: 1px solid rgba(51, 153, 204, 0.5);
}
.status-idle {
  background: rgba(102, 204, 0, 0.15);
  border: 1px solid rgba(102, 204, 0, 0.4);
}
.status-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-label { font-weight: 700; }
.status-eta { opacity: 0.7; }
.status-time { font-size: 0.75rem; opacity: 0.55; margin-left: auto; }

/* Spinner */
.spin-icon { width: 18px; height: 18px; animation: spin 1s linear infinite; color: var(--OrbitLightBlue); }
.spin-track { opacity: 0.25; }
.spin-fill  { opacity: 0.85; }
.check-icon { width: 18px; height: 18px; color: var(--OrbitGreen, #66CC00); }
@keyframes spin { to { transform: rotate(360deg); } }

/* Stats */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
@media (max-width: 640px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
.stat-card {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 10px 12px;
}
.stat-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.6; margin-bottom: 4px; }
.stat-value { font-size: 1.5rem; font-weight: 800; }
.stat-red   { color: #f87171; }
.stat-sub   { font-size: 0.7rem; opacity: 0.45; margin-top: 2px; }

/* Session note */
.session-note {
  font-size: 0.78rem;
  opacity: 0.65;
  background: rgba(0,0,0,0.15);
  border-radius: 6px;
  padding: 7px 12px;
}

/* Panels layout */
.panels {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 10px;
  min-height: 0;
  flex: 1;
}
@media (max-width: 700px) { .panels { grid-template-columns: 1fr; } }

.panel {
  background: rgba(0,0,0,0.25);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.panel-wide { /* takes remaining space via 1fr */ }

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}
.panel-title { font-size: 0.9rem; font-weight: 700; }
.panel-sub   { font-size: 0.7rem; opacity: 0.5; margin-top: 1px; }

.error-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  flex-shrink: 0;
}
.badge-red   { background: rgba(220,38,38,0.25); color: #fca5a5; border: 1px solid rgba(220,38,38,0.4); }
.badge-green { background: rgba(102,204,0,0.2);  color: #86efac; border: 1px solid rgba(102,204,0,0.35); }

.panel-scroll {
  overflow-y: auto;
  flex: 1;
}

.panel-empty {
  padding: 24px;
  text-align: center;
  font-size: 0.8rem;
  opacity: 0.4;
}

/* Error rows */
.error-row {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  font-size: 0.75rem;
}
.error-time { opacity: 0.5; margin-bottom: 2px; }
.error-msg  { color: #fca5a5; font-family: monospace; word-break: break-all; }
.error-meta { opacity: 0.4; font-family: monospace; margin-top: 2px; font-size: 0.7rem; }

/* Activity rows */
.activity-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  font-size: 0.78rem;
  flex-wrap: wrap;
}
.vpn-pill {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  flex-shrink: 0;
}
.pill-vpn   { background: rgba(220,38,38,0.25); color: #fca5a5; border: 1px solid rgba(220,38,38,0.4); }
.pill-clean { background: rgba(102,204,0,0.2);  color: #86efac; border: 1px solid rgba(102,204,0,0.35); }

.activity-user   { font-weight: 700; flex-shrink: 0; }
.activity-ip     { font-family: monospace; font-size: 0.7rem; opacity: 0.5; flex-shrink: 0; }
.activity-type   { font-size: 0.7rem; color: #fbbf24; flex-shrink: 0; }
.activity-isp    { font-size: 0.7rem; opacity: 0.55; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px; }
.activity-country { font-size: 0.7rem; opacity: 0.45; flex-shrink: 0; }
.activity-time   { font-size: 0.7rem; opacity: 0.4; margin-left: auto; flex-shrink: 0; }
</style>
