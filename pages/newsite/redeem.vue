<template>
  <NuxtLayout name="newsite-template">
    <template #sidebar-top>
      <UserInfo />
    </template>
    <template #sidebar-bottom>
      <WinballAd />
    </template>
    <template #main-content>
      <div class="rd-wrap">
        <!-- Balloons -->
        <div v-if="showBalloons" class="rd-balloons">
          <span
            v-for="b in balloons"
            :key="b.id"
            class="rd-balloon"
            :style="{ left: b.left, animationDelay: b.delay }"
          >
            🎈
          </span>
        </div>

        <div class="rd-panel">
          <h1 class="rd-title">Redeem Code</h1>

          <form @submit.prevent="submit">
            <label for="rd-code" class="rd-label">Enter your code</label>
            <input
              id="rd-code"
              v-model="code"
              type="text"
              required
              class="rd-input"
              placeholder="e.g. SPRING2025"
            />
            <button type="submit" class="rd-btn">Redeem</button>
          </form>

          <p v-if="error" class="rd-error">{{ error }}</p>

          <!-- Success -->
          <div v-if="success" class="rd-success-wrap">
            <p class="rd-success-heading">🎉 Success! You've been awarded:</p>

            <div v-if="rewards.points" class="rd-points-badge">
              {{ rewards.points.toLocaleString() }} points
            </div>

            <!-- cToon cards -->
            <div class="rd-grid">
              <div
                v-for="item in rewards.ctoons"
                :key="item.ctoonId + '-' + item.mintNumber"
                class="rd-card"
              >
                <span class="rd-qty">{{ item.quantity || 1 }}×</span>
                <h2 class="rd-card-name">{{ item.name }}</h2>
                <div class="rd-card-img-wrap">
                  <img :src="item.assetPath" class="rd-card-img" />
                </div>
                <div class="rd-card-meta">
                  <p class="capitalize">
                    {{ item.rarity || '—' }}<span v-if="item.set"> • {{ item.set }}</span>
                  </p>
                </div>
              </div>
            </div>

            <!-- Background unlocks -->
            <div v-if="rewards.backgrounds?.length" class="rd-bgs">
              <h3 class="rd-bgs-title">Backgrounds</h3>
              <div class="rd-grid">
                <div v-for="bg in rewards.backgrounds" :key="bg.id" class="rd-bg-card">
                  <img v-if="bg.imagePath" :src="bg.imagePath" class="rd-bg-img" />
                  <div class="rd-bg-info">
                    <div class="rd-bg-label">{{ bg.label || 'Untitled' }}</div>
                    <div class="rd-bg-sub">Unlocked</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <ClientOnly>
            <div v-html="rawHTML"></div>
          </ClientOnly>
        </div>
      </div>
    </template>
  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false, middleware: 'newsite', showAdbar: true, showNav: true })

const rawHTML = '<!-- My special production comment for this page -->'

const code = ref('')
const error = ref('')
const success = ref(false)
const rewards = ref({ points: 0, ctoons: [], backgrounds: [] })

const showBalloons = ref(false)
const balloons = ref([])

async function submit() {
  error.value = ''
  success.value = false
  rewards.value = { points: 0, ctoons: [], backgrounds: [] }

  try {
    const res = await fetch('/api/redeem', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.value.trim() })
    })
    const payload = await res.json()
    if (!res.ok) {
      error.value = payload.message || 'Invalid or expired code.'
      return
    }

    rewards.value.points = payload.points ?? 0
    rewards.value.ctoons = payload.ctoons ?? []
    rewards.value.backgrounds = payload.backgrounds ?? []
    success.value = true
    code.value = ''

    balloons.value = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: Math.random() * 90 + '%',
      delay: (Math.random() * 1.5) + 's'
    }))
    showBalloons.value = true
    setTimeout(() => { showBalloons.value = false }, 5000)
  } catch (e) {
    console.error(e)
    error.value = e.message || 'An unexpected error occurred.'
  }
}
</script>

<style>
html {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat fixed !important;
}

body {
  background: transparent !important;
  min-height: 100vh;
}
</style>

<style scoped>
.rd-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 12px;
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.rd-panel {
  width: 100%;
  max-width: 440px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px;
}

.rd-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 16px;
}

.rd-label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
}

.rd-input {
  display: block;
  width: 100%;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 8px 12px;
  color: #fff;
  font-size: 0.875rem;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.rd-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.rd-input:focus {
  border-color: var(--OrbitLightBlue, #3399cc);
}

.rd-btn {
  margin-top: 12px;
  width: 100%;
  background: var(--OrbitDarkBlue, #003466);
  border: 1px solid var(--OrbitLightBlue, #3399cc);
  color: #fff;
  border-radius: 8px;
  padding: 9px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.rd-btn:hover {
  background: var(--OrbitLightBlue, #3399cc);
}

.rd-error {
  margin-top: 8px;
  font-size: 0.8125rem;
  color: #f87171;
}

.rd-success-wrap {
  margin-top: 20px;
}

.rd-success-heading {
  font-weight: 600;
  color: #86efac;
  margin-bottom: 12px;
}

.rd-points-badge {
  margin-bottom: 16px;
  background: rgba(134, 239, 172, 0.1);
  border: 1px solid rgba(134, 239, 172, 0.3);
  border-radius: 10px;
  padding: 10px 14px;
  color: #86efac;
  font-size: 0.875rem;
  font-weight: 600;
}

.rd-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.rd-card {
  position: relative;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.rd-qty {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--OrbitDarkBlue, #003466);
  border: 1px solid var(--OrbitLightBlue, #3399cc);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 6px;
}

.rd-card-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  text-align: center;
  margin-top: 16px;
  margin-bottom: 8px;
  word-break: break-word;
}

.rd-card-img-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-bottom: 10px;
}

.rd-card-img {
  max-width: 100%;
  height: 112px;
  object-fit: contain;
}

.rd-card-meta {
  font-size: 0.6875rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
}

.rd-bgs {
  margin-top: 20px;
}

.rd-bgs-title {
  font-weight: 600;
  color: #fff;
  margin-bottom: 10px;
}

.rd-bg-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 10px;
}

.rd-bg-img {
  width: 64px;
  height: 40px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.rd-bg-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #fff;
}

.rd-bg-sub {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
}

.rd-balloons {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
  z-index: 10;
}

.rd-balloon {
  position: absolute;
  bottom: -2rem;
  font-size: 2rem;
  animation: rd-rise 4s ease-in forwards;
}

@keyframes rd-rise {
  0% { transform: translateY(0) scale(1); opacity: 1; }
  100% { transform: translateY(-120vh) scale(1.2); opacity: 0; }
}
</style>
