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
            <!-- Outbid notifications -->
            <div class="flex items-start justify-between gap-6">
              <div>
                <h2 class="text-lg font-semibold">Auction Notifications</h2>
                <p class="text-sm text-slate-600">
                  Receive Discord DMs when you’re outbid on an auction.
                </p>
              </div>

              <div class="flex items-center">
                <div v-if="loading" class="w-12 h-7 rounded-full bg-[var(--reorbit-tint)] border border-[var(--reorbit-border)] animate-pulse"></div>
                <label v-else class="inline-flex items-center cursor-pointer select-none">
                  <input type="checkbox" class="sr-only" v-model="allow" @change="onToggleOutbid" :disabled="savingOutbid || loading" />
                  <div :class="['w-12 h-7 rounded-full relative transition-colors', allow ? 'bg-[var(--reorbit-blue)]' : 'bg-gray-300']">
                    <div :class="['absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform', allow ? 'translate-x-5' : 'translate-x-0']"></div>
                  </div>
                </label>
              </div>
            </div>
            <p class="text-xs mt-2" :class="(savingOutbid || loading) ? 'opacity-60' : 'opacity-80'">
              {{ loading ? 'Loading current setting…' : (savingOutbid ? 'Saving…' : 'Changes are saved instantly.') }}
            </p>
            <p v-if="error" class="text-xs text-red-600 mt-2">{{ error }}</p>

            <div class="h-px w-full bg-[var(--reorbit-border)] my-6"></div>

            <!-- Wishlist auction notifications -->
            <div class="flex items-start justify-between gap-6">
              <div>
                <h2 class="text-lg font-semibold">Wishlist Auction Alerts</h2>
                <p class="text-sm text-slate-600">
                  Receive Discord DMs when a cToon on your wishlist goes on auction.
                </p>
              </div>

              <div class="flex items-center">
                <div v-if="loading" class="w-12 h-7 rounded-full bg-[var(--reorbit-tint)] border border-[var(--reorbit-border)] animate-pulse"></div>
                <label v-else class="inline-flex items-center cursor-pointer select-none">
                  <input type="checkbox" class="sr-only" v-model="allowWishlist" @change="onToggleWishlist" :disabled="savingWishlist || loading" />
                  <div :class="['w-12 h-7 rounded-full relative transition-colors', allowWishlist ? 'bg-[var(--reorbit-blue)]' : 'bg-gray-300']">
                    <div :class="['absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform', allowWishlist ? 'translate-x-5' : 'translate-x-0']"></div>
                  </div>
                </label>
              </div>
            </div>
            <p class="text-xs mt-2" :class="(savingWishlist || loading) ? 'opacity-60' : 'opacity-80'">
              {{ loading ? 'Loading current setting…' : (savingWishlist ? 'Saving…' : 'Changes are saved instantly.') }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ middleware: 'auth', layout: 'default' })

import { ref, onMounted } from 'vue'

const allow          = ref(true)   // outbid
const allowWishlist  = ref(true)   // wishlist auctions
const savingOutbid   = ref(false)
const savingWishlist = ref(false)
const loading        = ref(true)
const error          = ref('')

async function loadSetting() {
  error.value = ''
  loading.value = true
  try {
    const res = await fetch('/api/user/notifications', { credentials: 'include' })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    console.log('Loaded notification settings:', data)
    allow.value = !!data.allowAuctionNotifications
    allowWishlist.value = !!data.allowWishlistAuctionNotifications
  } catch (e) {
    console.error(e)
    error.value = 'Failed to load preference.'
    // keep default true if it fails
  } finally {
    loading.value = false
  }
}

async function onToggleOutbid() {
  if (loading.value) return
  error.value = ''
  const next = allow.value
  const prev = !allow.value
  savingOutbid.value = true
  try {
    const res = await fetch('/api/user/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ allowAuctionNotifications: next })
    })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    console.log('Saved outbid notification setting:', data)
    allow.value = !!data.allowAuctionNotifications
  } catch (err) {
    console.error(err)
    allow.value = prev
    error.value = 'Could not save. Please try again.'
  } finally {
    savingOutbid.value = false
  }
}

async function onToggleWishlist() {
  if (loading.value) return
  error.value = ''
  const next = allowWishlist.value
  const prev = !allowWishlist.value
  savingWishlist.value = true
  try {
    const res = await fetch('/api/user/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ allowWishlistAuctionNotifications: next })
    })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    console.log('Saved wishlist notification setting:', data)
    allowWishlist.value = !!data.allowWishlistAuctionNotifications
  } catch (err) {
    console.error(err)
    allowWishlist.value = prev
    error.value = 'Could not save. Please try again.'
  } finally {
    savingWishlist.value = false
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
