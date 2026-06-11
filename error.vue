<template>
  <main class="reorbit-theme bg-white text-slate-900 min-h-screen">
    <!-- Top nav -->
    <header
      class="sticky top-0 z-40 backdrop-blur border-b border-[var(--reorbit-border)]"
      style="background: var(--reorbit-navy)"
    >
      <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-8 flex items-center justify-between">
        <NuxtLink
          to="/"
          class="absolute inset-y-0 left-4 flex items-center gap-3 md:left-1/2 md:-translate-x-1/2"
          aria-label="Go to homepage"
        >
          <img
            src="/images/newlogo.gif"
            alt="Cartoon ReOrbit logo"
            class="max-h-20 max-w-[300px] w-auto h-auto object-contain md:h-20 md:max-h-none md:max-w-none"
          />
          <span class="sr-only">Cartoon ReOrbit</span>
        </NuxtLink>

        <div class="ml-auto flex items-center gap-3">
          <button
            class="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--reorbit-deep)]
                  bg-gradient-to-br from-[var(--reorbit-lime)] to-[var(--reorbit-green-2)] shadow hover:brightness-95"
            @click="goHome"
          >
            Back home
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
      <div class="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div class="rounded-3xl border border-white/10 bg-white/90 shadow-2xl backdrop-blur p-8 sm:p-10 text-center">
          <p class="text-sm font-semibold tracking-wide text-[var(--reorbit-blue)]">
            Error {{ statusCode }}
          </p>
          <h1 class="mt-3 text-3xl sm:text-4xl font-extrabold text-[var(--reorbit-deep)]">
            {{ headline }}
          </h1>
          <p class="mt-3 text-base text-slate-600">
            {{ message }}
          </p>
          <img
            src="/images/500.gif"
            alt="Server error illustration"
            class="mx-auto mt-8 max-w-full w-[360px] sm:w-[420px] h-auto rounded-2xl border border-[var(--reorbit-border)] bg-white"
          />
          <div
            v-if="isServerError && errorDetails"
            class="mt-8 rounded-2xl border border-[var(--reorbit-border)] bg-[var(--reorbit-tint)] p-4 sm:p-6 text-left"
          >
            <p class="text-sm font-semibold tracking-wide text-[var(--reorbit-blue)]">
              Error details
            </p>
            <pre class="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{{ errorDetails }}</pre>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  error: {
    type: Object,
    default: () => ({})
  }
})

const statusCode = computed(() => props.error?.statusCode || 500)
const isServerError = computed(() => statusCode.value >= 500)
const headline = 'That page drifted out of orbit.'
const message = computed(() =>
  isServerError.value
    ? 'We hit a server snag. Try again in a moment or head back home.'
    : 'The page you are looking for does not exist. Head back home and try again.'
)

useHead(() => ({
  title: `${isServerError.value ? 'Server error' : 'Page not found'} | Cartoon ReOrbit`
}))

const errorData = computed(() => {
  let data = props.error?.data
  if (typeof data === 'string') {
    try { data = JSON.parse(data) } catch { /* leave as plain string */ }
  }
  return data
})

const errorDetails = computed(() => {
  const data = errorData.value
  const stack = props.error?.stack
    || (data && typeof data === 'object' ? data.stack : undefined)

  const parts = [
    props.error?.statusMessage,
    props.error?.message
  ]

  if (data != null) {
    if (typeof data === 'object') {
      const { stack: _stack, ...rest } = data
      if (Object.keys(rest).length) parts.push(JSON.stringify(rest, null, 2))
    } else {
      parts.push(String(data))
    }
  }

  if (stack) parts.push(stack)

  return parts
    // Drop Nitro's redacted placeholder so non-admins get no details panel
    .filter((part, index, all) => part && part !== 'Server Error' && all.indexOf(part) === index)
    .join('\n\n')
})

const goHome = () => clearError({ redirect: '/' })
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
  --reorbit-border: rgba(150,71,207,0.55);
  --reorbit-tint: rgba(0,44,98,0.035);
  --reorbit-cyan-transparent: rgba(15,221,214,0.12);
}
</style>
