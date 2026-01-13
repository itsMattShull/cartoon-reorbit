<template>
  <main class="bg-white text-slate-900">
    <!-- Top nav -->
    <header class="sticky top-0 z-40 backdrop-blur border-b border-[var(--reorbit-border)]" style="background: var(--reorbit-navy)">
      <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-8 flex items-center justify-between">
        <!-- logo: left on small, centered on md+ -->
        <NuxtLink
          to="/"
          class="absolute inset-y-0 left-4 flex items-center gap-3
                md:left-1/2 md:-translate-x-1/2"
        >
          <img :src="currentAdSrc || '/images/logo-reorbit.png'" alt="Cartoon ReOrbit logo" class="max-h-20 max-w-[300px] w-auto h-auto object-contain md:h-20 md:max-h-none md:max-w-none" />
          <span class="sr-only">Cartoon ReOrbit</span>
        </NuxtLink>

        <!-- right controls -->
        <div class="ml-auto flex items-center gap-3">
          <button
            @click="login"
            class="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--reorbit-deep)]
                  bg-gradient-to-br from-[var(--reorbit-lime)] to-[var(--reorbit-green-2)] shadow hover:brightness-95"
            aria-label="Sign in with Discord"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 245 240" class="h-4 w-4 fill-[var(--reorbit-deep)]" aria-hidden="true">
              <path d="M104.4 104.5c-5.7 0-10.2 5-10.2 11.1s4.6 11.1 10.2 11.1c5.7 0 10.2-5 10.2-11.1.1-6.1-4.5-11.1-10.2-11.1zm36.2 0c-5.7 0-10.2 5-10.2 11.1s4.6 11.1 10.2 11.1c5.7 0 10.2-5 10.2-11.1s-4.5-11.1-10.2-11.1z"/>
              <path d="M189.5 20h-134C42 20 30 32 30 46v148c0 14 12 26 25.5 26h114.3l-5.4-18.7 13 12 12.3 11.3 21.8 19V46c0-14-12-26-25.5-26zm-37 141s-3.5-4.2-6.4-7.9c12.7-3.6 17.5-11.6 17.5-11.6-4 2.6-7.8 4.4-11.2 5.6-4.9 2.1-9.6 3.4-14.2 4.2-9.4 1.8-18 1.3-25.3-.1-5.6-1.1-10.4-2.6-14.4-4.2-2.2-.9-4.6-2-7.1-3.4-.3-.2-.6-.3-.9-.5-.2-.1-.3-.2-.4-.3-1.8-1-2.8-1.7-2.8-1.7s4.6 7.6 16.7 11.4c-2.9 3.7-6.5 8-6.5 8-21.6-.7-29.8-14.9-29.8-14.9 0-31.5 14-57 14-57 14-10.4 27.2-10.1 27.2-10.1l1 1.2c-17.5 5.1-25.6 13-25.6 13s2.1-1.1 5.6-2.7c10.2-4.5 18.3-5.8 21.6-6.1.5-.1.9-.1 1.4-.1 5-1 10.6-1.2 16.5-0.1 7.7 1.1 15.9 3.9 24.3 9.6 0 0-7.7-7.3-24.3-12.3l1.4-1.6s13.2-.3 27.2 10.1c0 0 14 25.5 14 57 0 0-8.2 14.2-29.8 14.9z"/>
            </svg>
            Play now
          </button>
        </div>
      </div>
    </header>

    <!-- Hero -->
    <section
      class="relative overflow-hidden"
      style="background:
  linear-gradient(180deg, var(--reorbit-cyan) -50%, transparent 100%) top/100% 20px no-repeat,
  linear-gradient(180deg, var(--reorbit-blue), var(--reorbit-navy))"
    >
      <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-8">
        <div class="grid lg:grid-cols-2 gap-8">
          <div class="relative">
            <img
              :src="topLeftSrc"
              alt="Cartoon ReOrbit Welcome Image"
              class="rounded-2xl" style="width:100%; cursor: pointer; margin-top: -17px"
              @click="login"
            />
            <div class="my-8">
              <h1 class="mt-4 text-3xl sm:text-4xl font-extrabold leading-tight text-white" style="font-family: 'Comic Sans MS', cursive, sans-serif;">
                Collect cToons. Build cZones. Trade and play in real time.
              </h1>
              <p class="mt-4 text-lg text-white/80 max-w-xl">
                Cartoon ReOrbit is a modern remake of the early-2000s Cartoon Orbit experience. Own digital cards (cToons), design themed boards (cZones), and compete through trades, auctions, and mini-games like gToons Clash.
              </p>
            </div>

            <div class="relative">
              <div class="rounded-2xl border border-white/10 bg-white/5 p-2 shadow-2xl backdrop-blur">
                <img :src="bottomLeftSrc" alt="Cartoon ReOrbit gToons preview" class="rounded-2xl" style="width:100%; cursor: pointer;" @click="login" />
              </div>
            </div>
          </div>

          <div class="relative">
            <div class="rounded-2xl border border-white/10 bg-white/5 p-2 shadow-2xl backdrop-blur">
              <img
                :src="topRightSrc"
                alt="Cartoon ReOrbit WinWheel Preview"
                class="rounded-2xl" style="width:100%; cursor: pointer;"
                @click="login"
              />
            </div>
            <!-- bottom-right card -->
            <div class="rounded-2xl border border-white/10 bg-white/5 p-2 shadow-2xl backdrop-blur mt-2 relative">
              <img
                :src="bottomRightSrc"
                alt="Cartoon ReOrbit cToons preview"
                class="rounded-2xl w-full cursor-pointer"
                @click="login"
              />

              <!-- centered prize overlay -->
              <img
                v-if="winballPrizeUrl"
                :src="winballPrizeUrl"
                alt="Current Winball prize"
                class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                      max-w-[60%] max-h-[60%] object-contain rounded-xl"
              />
            </div>
            <div
              class="pointer-events-none absolute -right-10 -bottom-10 h-56 w-56 rounded-full blur-2xl"
              style="background: radial-gradient(circle, var(--reorbit-cyan), transparent 30%);"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Community stats -->
    <section class="py-12 bg-white">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="mb-4">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">Community stats</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div class="rounded-3xl border border-[var(--reorbit-border)] bg-white p-6 shadow-sm text-center">
            <div class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">Users</div>
            <div class="mt-2 text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-[var(--reorbit-purple)] via-[var(--reorbit-cyan)] to-[var(--reorbit-lime)] bg-clip-text text-transparent">
              {{ formatNumber(stats?.users) }}
            </div>
          </div>
          <div class="rounded-3xl border border-[var(--reorbit-border)] bg-white p-6 shadow-sm text-center">
            <div class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">Active last month</div>
            <div class="mt-2 text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-[var(--reorbit-purple)] via-[var(--reorbit-cyan)] to-[var(--reorbit-lime)] bg-clip-text text-transparent">
              {{ formatNumber(stats?.activeUsers) }}
            </div>
          </div>
          <div class="rounded-3xl border border-[var(--reorbit-border)] bg-white p-6 shadow-sm text-center">
            <div class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">cToons sold</div>
            <div class="mt-2 text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-[var(--reorbit-purple)] via-[var(--reorbit-cyan)] to-[var(--reorbit-lime)] bg-clip-text text-transparent">
              {{ formatNumber(stats?.ctoonsSold) }}
            </div>
          </div>
          <div class="rounded-3xl border border-[var(--reorbit-border)] bg-white p-6 shadow-sm text-center">
            <div class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">Active auctions</div>
            <div class="mt-2 text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-[var(--reorbit-purple)] via-[var(--reorbit-cyan)] to-[var(--reorbit-lime)] bg-clip-text text-transparent">
              {{ formatNumber(stats?.activeAuctions) }}
            </div>
          </div>
          <div class="rounded-3xl border border-[var(--reorbit-border)] bg-white p-6 shadow-sm text-center">
            <div class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">Trades all time</div>
            <div class="mt-2 text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-[var(--reorbit-purple)] via-[var(--reorbit-cyan)] to-[var(--reorbit-lime)] bg-clip-text text-transparent">
              {{ formatNumber(stats?.tradesAllTime) }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section id="how" class="py-20 bg-[var(--reorbit-tint)]">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 class="text-3xl font-bold text-slate-900">Start in minutes</h2>
        <ol class="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <li class="rounded-2xl bg-white p-6 border border-[var(--reorbit-border)]">
            <p class="text-sm font-semibold text-slate-700">1. Sign in</p>
            <p class="mt-1 text-slate-600">Use Discord to create your free account.</p>
          </li>
          <li class="rounded-2xl bg-white p-6 border border-[var(--reorbit-border)]">
            <p class="text-sm font-semibold text-slate-700">2. Gather cToons</p>
            <p class="mt-1 text-slate-600">Claim your starter cToons, buy from the cMart, and open packs.</p>
          </li>
          <li class="rounded-2xl bg-white p-6 border border-[var(--reorbit-border)]">
            <p class="text-sm font-semibold text-slate-700">3. Build a cZone</p>
            <p class="mt-1 text-slate-600">Place cards, unlock bonuses, and share.</p>
          </li>
          <li class="rounded-2xl bg-white p-6 border border-[var(--reorbit-border)]">
            <p class="text-sm font-semibold text-slate-700">4. Trade and play</p>
            <p class="mt-1 text-slate-600">Complete sets through trades, auctions, and games.</p>
          </li>
        </ol>
        <div class="mt-8">
          <img @click="login" src="/images/notmember_top.gif" alt="Not a member yet? Join free today!" style="cursor: pointer; margin-bottom: -80px" />
        </div>
      </div>
    </section>

    <!-- Community / callout -->
    <section class="py-20">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid lg:grid-cols-3 gap-8">
        <div class="lg:col-span-2 rounded-3xl p-8 border border-[var(--reorbit-border)] bg-gradient-to-br from-[var(--reorbit-cyan-transparent)] to-white">
          <h3 class="text-2xl font-bold text-slate-900">Built by fans for fans</h3>
          <p class="mt-2 text-slate-600">
            Free to play. Community-driven. This project is not affiliated with, endorsed by, or sponsored by Cartoon Network or Warner Bros. Discovery.
          </p>
        </div>
        <div class="rounded-3xl p-8 border border-[var(--reorbit-border)] bg-white">
          <h3 class="text-2xl font-bold text-slate-900">Ready to orbit?</h3>
          <p class="mt-2 text-slate-600">Join and start collecting today.</p>
          <button
            @click="login"
            class="mt-4 w-full inline-flex items-center justify-center rounded-2xl px-6 py-3 font-semibold text-[var(--reorbit-deep)]
                   bg-gradient-to-br from-[var(--reorbit-lime)] to-[var(--reorbit-green-2)] shadow hover:brightness-95"
          >
            Play free
          </button>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section id="faq" class="py-20 bg-[var(--reorbit-tint)]">
      <div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h2 class="text-3xl font-bold text-slate-900">FAQ</h2>
        <div class="mt-6 space-y-4">
          <details class="group rounded-2xl bg-white p-6 border border-[var(--reorbit-border)]">
            <summary class="cursor-pointer font-semibold text-slate-800">Is this official?</summary>
            <p class="mt-2 text-slate-600">No. It is a fan project with original code and assets and no affiliation with Cartoon Network.</p>
          </details>
          <details class="group rounded-2xl bg-white p-6 border border-[var(--reorbit-border)]">
            <summary class="cursor-pointer font-semibold text-slate-800">Is it free?</summary>
            <p class="mt-2 text-slate-600">Yes. Core gameplay is free.</p>
          </details>
          <details class="group rounded-2xl bg-white p-6 border border-[var(--reorbit-border)]">
            <summary class="cursor-pointer font-semibold text-slate-800">How do trades and auctions stay fair?</summary>
            <p class="mt-2 text-slate-600">Trades use server validation and audit logs. Auctions include clear timers and anti-sniping rules.</p>
          </details>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-[var(--reorbit-border)]">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 text-sm text-slate-600">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {{ new Date().getFullYear() }} Cartoon ReOrbit</p>
          <nav class="flex items-center gap-6">
            <NuxtLink to="/privacy" class="hover:text-[var(--reorbit-blue)]">Privacy</NuxtLink>
          </nav>
        </div>
        <p class="mt-4 text-xs text-slate-500">
          Cartoon ReOrbit is a fan-made remake of Cartoon Orbit. All trademarks belong to their respective owners.
        </p>
      </div>
    </footer>
  </main>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAuth } from '@/composables/useAuth'

const { login } = useAuth()

definePageMeta({
  title: 'Home',
  layout: 'home'
})

/* ── Homepage images (existing) ─────────────────────────────── */
const { data: hp } = await useAsyncData('homepage-public', () => $fetch('/api/homepage'))

const topLeftSrc     = computed(() => hp.value?.topLeftImagePath     || '/images/welcome2.png')
const bottomLeftSrc  = computed(() => hp.value?.bottomLeftImagePath  || '/images/gtoonsbanner.png')
const topRightSrc    = computed(() => hp.value?.topRightImagePath    || '/images/posterOct25.png')
const bottomRightSrc = computed(() => hp.value?.bottomRightImagePath || '/images/ZoidsWinball.png')

const { data: stats } = await useAsyncData('homepage-stats', () => $fetch('/api/homepage/stats'))

function formatNumber(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0'
  return num.toLocaleString()
}

/* ── Ad logo rotation (new) ───────────────────────────────────
   - Uses /api/ads to get image list
   - GIF: advance after one loop
   - PNG/JPG/JPEG/WEBP/SVG: advance every 8s
*/
const currentAdSrc = ref('')
let adList = []
let idx = 0
let timer = null
const gifDurCache = new Map()
const abortCtrl = new AbortController()

function shuffle(a) {
  const x = a.slice()
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[x[i], x[j]] = [x[j], x[i]]
  }
  return x
}
function ext(url) {
  const m = (url || '').toLowerCase().match(/\.(gif|png|jpe?g|webp|svg)(?:\?|#|$)/)
  return m ? m[1] : ''
}
function nextAd() {
  if (!adList.length) return
  idx = (idx + 1) % adList.length
  currentAdSrc.value = adList[idx]
  scheduleNext()
}
async function gifDurationMs(url) {
  if (gifDurCache.has(url)) return gifDurCache.get(url)
  const res = await fetch(url, { signal: abortCtrl.signal })
  const buf = await res.arrayBuffer()
  const b = new Uint8Array(buf)
  if (b.length < 6 || String.fromCharCode(...b.slice(0, 3)) !== 'GIF') {
    gifDurCache.set(url, 6000); return 6000
  }
  // parse header + logical screen descriptor
  let i = 13
  if ((b[10] & 0x80) !== 0) i += 3 * (2 ** ((b[10] & 0x07) + 1)) // global color table
  let total = 0, delay = 0
  while (i < b.length) {
    const v = b[i++]
    if (v === 0x3B) break // trailer
    if (v === 0x21) { // extension
      const label = b[i++]
      if (label === 0xF9) { // GCE
        const size = b[i++]
        if (size === 4) {
          delay = (b[i+2] << 8) | b[i+1] // hundredths
          i += 4
        } else {
          i += size
        }
        i++ // terminator
      } else { // skip sub-blocks
        let s = b[i++]
        while (s && i < b.length) { i += s; s = b[i++] }
      }
    } else if (v === 0x2C) { // image descriptor
      i += 9
      const packed = b[i-1]
      if ((packed & 0x80) !== 0) i += 3 * (2 ** ((packed & 0x07) + 1)) // local color table
      i++ // LZW min code size
      let s = b[i++]
      while (s && i < b.length) { i += s; s = b[i++] } // image data blocks
      total += Math.max(delay, 1) // at least 1 hundredth
      delay = 0
    } else {
      break
    }
  }
  const ms = Math.max(total * 10, 500)
  gifDurCache.set(url, ms)
  return ms
}
async function scheduleNext() {
  clearTimeout(timer)
  const src = currentAdSrc.value
  if (!src) return
  try {
    if (ext(src) === 'gif') {
      const ms = await gifDurationMs(src)
      timer = setTimeout(nextAd, ms)
    } else {
      timer = setTimeout(nextAd, 8000)
    }
  } catch {
    timer = setTimeout(nextAd, 8000)
  }
}
async function initAds() {
  try {
    const res = await $fetch('/api/ads', { params: { take: 100 } })
    const urls = (res?.items || []).map(i => i.imagePath).filter(Boolean)
    if (!urls.length) return
    adList = shuffle(urls)
    idx = Math.floor(Math.random() * adList.length)
    currentAdSrc.value = adList[idx]
    scheduleNext()
  } catch {}
}
onMounted(initAds)
onBeforeUnmount(() => { clearTimeout(timer); abortCtrl.abort() })

/* ── SEO (existing) ─────────────────────────────────────────── */
const url = useRequestURL()
const siteName = 'Cartoon ReOrbit'
const title = 'Cartoon ReOrbit — Free Fan-Made Cartoon Orbit Remake'
const description = 'Collect cToons, build cZones, and trade through live auctions and mini-games. Free, community-driven remake of Cartoon Orbit. Not affiliated with Cartoon Network.'
const ogImage = 'https://www.cartoonreorbit.com/images/logo-reorbit.png'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogType: 'website',
  ogUrl: url.href,
  ogImage,
  twitterCard: 'summary_large_image',
  twitterTitle: title,
  twitterDescription: description,
  twitterImage: ogImage,
  themeColor: '#002C62',
  robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  author: 'Cartoon ReOrbit Team',
  generator: 'Nuxt 3',
  keywords: 'Cartoon Orbit remake, Cartoon ReOrbit: cToons, cZones, Cartoon Network fan project, trading, auctions, gToons, and more mini games'
})

useHead({
  htmlAttrs: { lang: 'en' },
  link: [
    { rel: 'canonical', href: url.href },
    { rel: 'apple-touch-icon', sizes: '57x57', href: '/images/apple-icon-57x57.png' },
    { rel: 'apple-touch-icon', sizes: '60x60', href: '/images/apple-icon-60x60.png' },
    { rel: 'apple-touch-icon', sizes: '72x72', href: '/images/apple-icon-72x72.png' },
    { rel: 'apple-touch-icon', sizes: '76x76', href: '/images/apple-icon-76x76.png' },
    { rel: 'apple-touch-icon', sizes: '114x114', href: '/images/apple-icon-114x114.png' },
    { rel: 'apple-touch-icon', sizes: '120x120', href: '/images/apple-icon-120x120.png' },
    { rel: 'apple-touch-icon', sizes: '144x144', href: '/images/apple-icon-144x144.png' },
    { rel: 'apple-touch-icon', sizes: '152x152', href: '/images/apple-icon-152x152.png' },
    { rel: 'apple-touch-icon', sizes: '180x180', href: '/images/apple-icon-180x180.png' },
    { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/images/android-icon-192x192.png' },
    { rel: 'icon', type: 'image/png', sizes: '32x32',  href: '/images/favicon-32x32.png' },
    { rel: 'icon', type: 'image/png', sizes: '96x96',  href: '/images/favicon-96x96.png' },
    { rel: 'icon', type: 'image/png', sizes: '16x16',  href: '/images/favicon-16x16.png' },
    { rel: 'manifest', href: '/images/manifest.json' },
  ],
  meta: [
    { name: 'application-name', content: siteName },
    { name: 'apple-mobile-web-app-title', content: siteName },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'format-detection', content: 'telephone=no' },
    { name: 'msapplication-TileColor', content: '#ffffff' },
    { name: 'msapplication-TileImage', content: '/ms-icon-144x144.png' },
    { name: 'theme-color', content: '#ffffff' },
  ],
  script: [
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: siteName,
        url: url.origin,
        logo: `${url.origin}/logo-reorbit.png`
      })
    },
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: siteName,
        url: url.origin,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${url.origin}/search?q={query}`,
          'query-input': 'required name=query'
        }
      })
    },
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: 'Is Cartoon ReOrbit official?', acceptedAnswer: { '@type': 'Answer', text: 'No. It is a fan project with original code and assets and is not affiliated with Cartoon Network.' } },
          { '@type': 'Question', name: 'Is it free to play?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Core gameplay is free.' } },
          { '@type': 'Question', name: 'How are trades and auctions secured?', acceptedAnswer: { '@type': 'Answer', text: 'Trades use server validation and audit logs. Auctions run with transparent timers and anti-sniping rules.' } }
        ]
      })
    }
  ]
})

const { data: prizeData } = await useAsyncData('winball-prize', () =>
  $fetch('/api/winball-prize')
)

const winballPrizeUrl = computed(() =>
  prizeData.value?.prize?.ctoon?.imageUrl || ''
)
</script>

<style>
:root{
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
  --reorbit-border: rgba(150,71,207,0.55);
  --reorbit-tint: rgba(0,44,98,0.035);
  --reorbit-cyan-transparent: rgba(15,221,214,0.12);
}
</style>
