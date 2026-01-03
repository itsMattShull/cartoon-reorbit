<template>
  <div
    class="reorbit-theme relative overflow-hidden min-h-screen"
    style="background:
      linear-gradient(180deg, var(--reorbit-cyan) -50%, transparent 100%) top/100% 100px no-repeat,
      linear-gradient(180deg, var(--reorbit-blue), var(--reorbit-navy))">
    <Nav />

    <div class="mt-16 md:mt-20 md:pt-6 min-h-screen p-6 text-white">
      <div class="max-w-3xl mx-auto">
        <div class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] bg-white/95 backdrop-blur-sm">
          <div class="h-1 w-full bg-gradient-to-r from-[var(--reorbit-purple)] via-[var(--reorbit-cyan)] to-[var(--reorbit-lime)]"></div>

          <div class="px-6 py-4 text-slate-900 border-b border-[var(--reorbit-border)]">
            <h1 class="text-2xl font-bold text-[var(--reorbit-blue)]">Settings</h1>
            <p class="text-sm text-slate-600">Manage account preferences.</p>
          </div>

          <div class="p-6 text-slate-900">
            <div class="flex items-start justify-between gap-6">
              <div>
                <h2 class="text-lg font-semibold">Auction Notifications</h2>
                <p class="text-sm text-slate-600">
                  Receive Discord DMs when you’re outbid on an auction.
                </p>
              </div>

              <div class="flex items-center">
                <!-- Skeleton while loading -->
                <div
                  v-if="loading"
                  class="w-12 h-7 rounded-full bg-[var(--reorbit-tint)] border border-[var(--reorbit-border)] animate-pulse"
                ></div>

                <!-- Real toggle once loaded -->
                <label
                  v-else
                  class="inline-flex items-center cursor-pointer select-none"
                >
                  <!-- hidden checkbox, bound to `allow` -->
                  <input
                    type="checkbox"
                    class="sr-only"
                    v-model="allow"
                    @change="onToggle"
                    :disabled="saving || loading"
                  />
                  <!-- track -->
                  <div
                    :class="[
                      'w-12 h-7 rounded-full relative transition-colors',
                      allow ? 'bg-[var(--reorbit-blue)]' : 'bg-gray-300'
                    ]"
                  >
                    <!-- knob -->
                    <div
                      :class="[
                        'absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform',
                        allow ? 'translate-x-5' : 'translate-x-0'
                      ]"
                    ></div>
                  </div>
                </label>
              </div>
            </div>

            <p class="text-xs mt-2" :class="(saving || loading) ? 'opacity-60' : 'opacity-80'">
              {{
                loading
                  ? 'Loading current setting…'
                  : saving
                    ? 'Saving…'
                    : 'Changes are saved instantly.'
              }}
            </p>

            <p v-if="error" class="text-xs text-red-600 mt-2">
              {{ error }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ title: 'Settings', middleware: 'auth', layout: 'default' })

import { ref, onMounted } from 'vue'

const allow   = ref(true)
const saving  = ref(false)
const loading = ref(true)
const error   = ref('')

async function loadSetting() {
  error.value = ''
  loading.value = true
  try {
    const res = await fetch('/api/user/notifications', { credentials: 'include' })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    allow.value = !!data.allowAuctionNotifications
  } catch (e) {
    console.error(e)
    error.value = 'Failed to load preference.'
    // keep default true if it fails
  } finally {
    loading.value = false
  }
}

async function onToggle() {
  if (loading.value) return

  error.value = ''
  const next = allow.value          // v-model already updated
  const prev = !allow.value         // previous state is opposite
  saving.value = true
  try {
    const res = await fetch('/api/user/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ allowAuctionNotifications: next })
    })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    allow.value = !!data.allowAuctionNotifications
  } catch (err) {
    console.error(err)
    allow.value = prev
    error.value = 'Could not save. Please try again.'
  } finally {
    saving.value = false
  }
}

onMounted(loadSetting)
</script>

<style>
.reorbit-theme{
  --reorbit-deep: #010A36;
  --reorbit-navy: #002C62;
  --reorbit-blue: #2D5294;
  --reorbit-cyan: #0FDDD6;
  --reorbit-aqua: #16ECE9;
  --reorbit-teal: #19E6AC;
  --reorbit-green: #51F68E;
  --reorbit-green-2: #70F873;
  --reorbit-lime: #AFFA2D;
  --reorbit-lime-2: #B3FB57;
  --reorbit-purple: #9647CF;
  --reorbit-border: rgba(45,82,148,0.25);
  --reorbit-tint: rgba(0,44,98,0.035);
  --reorbit-cyan-transparent: rgba(15,221,214,0.12);
  --reorbit-purple-transparent: rgba(150,71,207,0.12);
  --reorbit-green-transparent: rgba(81,246,142,0.12);
}
</style>
