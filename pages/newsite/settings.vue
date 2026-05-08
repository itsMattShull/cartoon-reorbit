<template>
  <NuxtLayout name="newsite-template">
    <template #sidebar-top>
      <UserInfo />
    </template>
    <template #sidebar-bottom>
      <WinballPromo />
    </template>
    <template #main-content>
      <div class="settings-content">
        <div class="settings-id-bar">
          <span class="settings-id-label">ReOrbit ID:</span>
          <span class="settings-id-value">{{ user?.id ?? '—' }}</span>
        </div>

        <div class="settings-section">
          <div class="settings-section-header">
            <h1 class="settings-title">Settings</h1>
            <p class="settings-subtitle">Manage account preferences.</p>

            <div class="settings-button-row">
              <button class="btn-avatar" @click="openAvatarModal">Change Avatar</button>
              <button class="btn-username" @click="openUsernameModal">Change Username</button>
            </div>
          </div>

          <div class="settings-body">
            <div class="settings-row">
              <div>
                <h2 class="settings-row-title">Auction Notifications</h2>
                <p class="settings-row-desc">Receive Discord DMs when you're outbid on an auction.</p>
              </div>

              <div class="toggle-wrap">
                <div v-if="loading" class="toggle-skeleton"></div>
                <label v-else class="toggle-label">
                  <input type="checkbox" class="sr-only" v-model="allow" @change="onToggle" :disabled="saving || loading" />
                  <div :class="['toggle-track', allow ? 'toggle-on' : 'toggle-off']">
                    <div :class="['toggle-knob', allow ? 'toggle-knob-on' : '']"></div>
                  </div>
                </label>
              </div>
            </div>

            <p class="settings-status" :class="{ 'settings-status-dim': saving || loading }">
              {{ loading ? 'Loading current setting…' : saving ? 'Saving…' : 'Changes are saved instantly.' }}
            </p>
            <p v-if="error" class="settings-error">{{ error }}</p>
          </div>
        </div>
      </div>

      <!-- Avatar modal -->
      <div v-if="showAvatarModal" class="modal-overlay" @click.self="closeAvatarModal">
        <div class="modal-box">
          <h2 class="modal-title">Change Avatar</h2>
          <p class="modal-desc">Choose a new avatar and click save.</p>

          <div class="avatar-grid">
            <label v-for="img in avatars" :key="img" class="avatar-option">
              <img
                :src="`/avatars/${img}`"
                :class="['avatar-img', avatarDraft === img ? 'avatar-selected' : '']"
              />
              <input v-model="avatarDraft" type="radio" class="sr-only" :value="img" />
            </label>
          </div>

          <p v-if="avatarError" class="modal-error">{{ avatarError }}</p>

          <div class="modal-actions">
            <button class="btn-cancel" @click="closeAvatarModal">Cancel</button>
            <button class="btn-save-blue" :disabled="savingAvatar" @click="saveAvatar">
              {{ savingAvatar ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Username modal -->
      <div v-if="showUsernameModal" class="modal-overlay" @click.self="closeUsernameModal">
        <div class="modal-box">
          <h2 class="modal-title">Change Username</h2>
          <p class="modal-desc">Pick from the Cartoon Orbit username builder.</p>

          <div class="username-selects">
            <select v-model="part1" class="username-select">
              <option v-for="w in wordLists[0]" :key="`s-1-${w}`" :value="w">{{ w }}</option>
            </select>
            <select v-model="part2" class="username-select">
              <option v-for="w in wordLists[1]" :key="`s-2-${w}`" :value="w">{{ w }}</option>
            </select>
            <select v-model="part3" class="username-select">
              <option v-for="w in wordLists[2]" :key="`s-3-${w}`" :value="w">{{ w }}</option>
            </select>
          </div>

          <button @click="randomize" class="btn-randomize">🔄 Randomize</button>

          <p v-if="usernameError" class="modal-error">{{ usernameError }}</p>

          <div class="modal-actions">
            <button class="btn-cancel" @click="closeUsernameModal">Cancel</button>
            <button class="btn-save-purple" :disabled="savingUsername" @click="saveUsername">
              {{ savingUsername ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false, middleware: 'newsite', showAdbar: true, showNav: true })

import { ref, onMounted } from 'vue'

const { user, fetchSelf } = useAuth()

const allow   = ref(true)
const saving  = ref(false)
const loading = ref(true)
const error   = ref('')
const avatars = ref([])

const showAvatarModal   = ref(false)
const showUsernameModal = ref(false)
const avatarDraft       = ref('')
const savingAvatar      = ref(false)
const avatarError       = ref('')

const savingUsername = ref(false)
const usernameError  = ref('')

const part1 = ref('')
const part2 = ref('')
const part3 = ref('')

const wordLists = [
  [
    'Awesome','Blazing','Brave','Bubbly','Cheery','Chill','Cosmic','Crazy','Cuddly','Cyber',
    'Daring','Dizzy','Electric','Epic','Funky','Fuzzy','Galactic','Glitchy','Groovy','Happy',
    'Hyper','Jolly','Jumpy','Kooky','Legendary','Loopy','Lucky','Mega','Mellow','Mighty',
    'Mystic','Neon','Nifty','Pixel','Plucky','Quirky','Radical','Raging','Retro','Rockin',
    'Sassy','Savvy','Silly','Slick','Snazzy','Sneaky','Solar','Spiffy','Spunky','Stellar',
    'Stormy','Sunny','Super','Swift','Techno','Thundering','Turbo','Ultra','Velvet','Vibrant',
    'Wild','Witty','Wobbly','Zany','Zen','Atomic','Blitz','Bold','Chroma','Crimson','Crystal',
    'Doodle','Dragon','Echo','Fluffy','Frosty','Fusion','Galaxy','Harmony','Inferno','Jade',
    'Karma','Lunar','Magnetic','Nova','Obsidian','Prismatic','Quantum','Rainbow','Shadow',
    'Titanic','Umbra','Vortex','Whimsical','Xeno','Yonder','Zephyr','Aurora','Orbit','Primo'
  ],
  [
    'Alien','Angel','Bandit','Beast','Bot','Brawler','Captain','Cheetah','Charger','Comet',
    'Crafter','Cyclone','Dancer','Dino','DJ','Dragon','Drifter','Dynamo','Eagle','Explorer',
    'Falcon','Flame','Gamer','Gargoyle','Ghost','Glider','Goblin','Golem','Guitar','Hacker',
    'Hero','Hobbit','Hunter','Jester','Jumper','Knight','Koala','Laser','Lion','Lizard',
    'Magician','Mammoth','Mantis','Martian','Mermaid','Mime','Monkey','Monster','Ninja',
    'Nomad','Otter','Owlet','Panther','Penguin','Phantom','Phoenix','Pirate','Pixel','Puma',
    'Punk','Puzzler','Raccoon','Ranger','Rhino','Robot','Rocket','Samurai','Sasquatch','Scout',
    'Seeker','Shark','Skater','Sloth','Snake','Spark','Specter','Spider','Sprite','Squirrel',
    'Stingray','Storm','Surfer','Tiger','Tinker','Titan','Toon','Torch','Tornado','Turtle',
    'Viking','Viper','Voyager','Warrior','Wizard','Wombat','Yeti','Zebra','Zeppelin','Zombie'
  ],
  [
    'Ace','Adventurer','Agent','Alchemist','Avenger','Baron','Beast','Champion','Chief','Crafter',
    'Crusader','Daredevil','Defender','Druid','Duke','Enchanter','Engineer','Fighter','Guru','Hunter',
    'Juggernaut','King','Legend','Lord','Maestro','Master','Maverick','Mercenary','Mystic','Nerd',
    'Nomad','Overlord','Paladin','Pirate','Prodigy','Protector','Pioneer','Queen','Raider','Ranger',
    'Rockstar','Rogue','Sage','Samurai','Scholar','Scout','Seer','Sentinel','Shaman','Slayer',
    'Smith','Sorcerer','Specialist','Speedster','Stargazer','Strategist','Summoner','Superstar',
    'Survivor','Tactician','Tempest','Tinker','Trailblazer','Traveler','Trickster','Vagabond','Vanguard',
    'Virtuoso','Visionary','Voyager','Warlock','Warrior','Whiz','Wizard','Wrestler','Warden','Warlord',
    'Architect','Artisan','Athlete','Commander','Conqueror','Creator','Dreamer','Explorer','Guardian',
    'Inventor','Leader','Pilot','Rebel','Sculptor','Seeker','Technician','Trendsetter','Tycoon','Wanderer'
  ]
]

function sample(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function randomize() {
  part1.value = sample(wordLists[0])
  part2.value = sample(wordLists[1])
  part3.value = sample(wordLists[2])
}

randomize()

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
  } finally {
    loading.value = false
  }
}

async function onToggle() {
  if (loading.value) return
  error.value = ''
  const next = allow.value
  const prev = !allow.value
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

async function openAvatarModal() {
  avatarError.value = ''
  if (!avatars.value.length) {
    avatars.value = await $fetch('/api/avatars', { credentials: 'include' })
  }
  avatarDraft.value = user.value?.avatar || ''
  showAvatarModal.value = true
}

function closeAvatarModal() { showAvatarModal.value = false }

async function saveAvatar() {
  avatarError.value = ''
  if (!avatarDraft.value) { avatarError.value = 'Please select an avatar.'; return }
  savingAvatar.value = true
  try {
    await $fetch('/api/auth/set-avatar', { method: 'POST', body: { avatar: avatarDraft.value }, credentials: 'include' })
    await fetchSelf({ force: true })
    closeAvatarModal()
  } catch (e) {
    avatarError.value = e?.data?.statusMessage || 'Could not save avatar.'
  } finally {
    savingAvatar.value = false
  }
}

function openUsernameModal() { usernameError.value = ''; randomize(); showUsernameModal.value = true }
function closeUsernameModal() { showUsernameModal.value = false }

async function saveUsername() {
  usernameError.value = ''
  const username = `${part1.value}${part2.value}${part3.value}`
  savingUsername.value = true
  try {
    await $fetch('/api/auth/set-username', { method: 'POST', body: { username }, credentials: 'include' })
    await fetchSelf({ force: true })
    closeUsernameModal()
  } catch (e) {
    usernameError.value = e?.data?.statusMessage || 'Username already taken, please pick a different one.'
  } finally {
    savingUsername.value = false
  }
}
</script>

<style>
body.page-newsite-settings .main-content { overflow-y: auto !important; scrollbar-width: thin; }
</style>

<style scoped>
.settings-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: #ffffff;
  font-family: var(--font-family, 'Nunito', sans-serif);
}

.settings-id-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(0, 0, 0, 0.25);
  border-bottom: 1px solid rgba(51, 153, 204, 0.4);
  flex-shrink: 0;
}

.settings-id-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.65);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.settings-id-value {
  font-size: 0.85rem;
  font-weight: 600;
  color: #66CC00;
  font-family: monospace;
}

.settings-section {
  flex: 1;
  overflow-y: auto;
}

.settings-section-header {
  padding: 14px 14px 12px;
  border-bottom: 1px solid rgba(51, 153, 204, 0.3);
  background: rgba(0, 0, 0, 0.15);
}

.settings-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 2px;
}

.settings-subtitle {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 10px;
}

.settings-button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn-avatar {
  padding: 6px 14px;
  border-radius: 6px;
  background: var(--OrbitDarkBlue, #336699);
  color: #ffffff;
  font-size: 0.78rem;
  font-weight: 700;
  font-family: inherit;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-avatar:hover { opacity: 0.85; }

.btn-username {
  padding: 6px 14px;
  border-radius: 6px;
  background: #66CC00;
  color: #003466;
  font-size: 0.78rem;
  font-weight: 700;
  font-family: inherit;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-username:hover { opacity: 0.85; }

.settings-body {
  padding: 14px;
}

.settings-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.settings-row-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 2px;
}

.settings-row-desc {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

.toggle-wrap { display: flex; align-items: center; flex-shrink: 0; }

.toggle-skeleton {
  width: 44px;
  height: 26px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.toggle-label { display: inline-flex; align-items: center; cursor: pointer; }

.toggle-track {
  width: 44px;
  height: 26px;
  border-radius: 999px;
  position: relative;
  transition: background 0.2s;
}

.toggle-on  { background: var(--OrbitLightBlue, #3399CC); }
.toggle-off { background: rgba(255, 255, 255, 0.2); }

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  background: #ffffff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle-knob-on { transform: translateX(18px); }

.settings-status {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 8px;
}

.settings-status-dim { opacity: 0.5; }

.settings-error {
  font-size: 0.72rem;
  color: #ff6b6b;
  margin-top: 6px;
}

/* Modals */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-box {
  background: #ffffff;
  border-radius: 10px;
  max-width: 520px;
  width: 100%;
  padding: 20px;
  color: #1a1a2e;
}

.modal-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--OrbitDarkBlue, #336699);
  margin: 0 0 4px;
}

.modal-desc {
  font-size: 0.78rem;
  color: #555;
  margin: 0 0 14px;
}

.avatar-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
  margin-bottom: 14px;
}

.avatar-option { cursor: pointer; }

.avatar-img {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 6px;
  border: 3px solid transparent;
}

.avatar-selected { border-color: var(--OrbitDarkBlue, #336699); }

.username-selects {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-bottom: 8px;
}

.username-select {
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 0.78rem;
  font-family: inherit;
}

.btn-randomize {
  font-size: 0.78rem;
  color: var(--OrbitDarkBlue, #336699);
  background: none;
  border: none;
  cursor: pointer;
  margin-bottom: 14px;
  padding: 0;
  font-family: inherit;
}

.btn-randomize:hover { text-decoration: underline; }

.modal-error {
  font-size: 0.78rem;
  color: #c0392b;
  margin-bottom: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-cancel {
  padding: 7px 16px;
  border-radius: 6px;
  border: 1px solid #ccc;
  background: #fff;
  cursor: pointer;
  font-size: 0.8rem;
  font-family: inherit;
}

.btn-save-blue {
  padding: 7px 16px;
  border-radius: 6px;
  background: var(--OrbitDarkBlue, #336699);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 700;
  font-family: inherit;
}

.btn-save-blue:disabled { opacity: 0.5; cursor: default; }

.btn-save-purple {
  padding: 7px 16px;
  border-radius: 6px;
  background: #66CC00;
  color: #003466;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 700;
  font-family: inherit;
}

.btn-save-purple:disabled { opacity: 0.5; cursor: default; }
</style>
