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

            <div class="mt-4 flex flex-wrap gap-3">
              <button
                @click="openAvatarModal"
                class="px-4 py-2 rounded-lg bg-[var(--reorbit-blue)] hover:bg-[var(--reorbit-deep)] text-white text-sm font-semibold transition"
              >
                Change Avatar
              </button>
              <button
                @click="openUsernameModal"
                class="px-4 py-2 rounded-lg bg-[var(--reorbit-purple)] hover:opacity-90 text-white text-sm font-semibold transition"
              >
                Change Username
              </button>
            </div>
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

    <div
      v-if="showAvatarModal"
      class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      @click.self="closeAvatarModal"
    >
      <div class="bg-white rounded-xl max-w-2xl w-full p-6 text-slate-900">
        <h2 class="text-xl font-bold text-[var(--reorbit-blue)]">Change Avatar</h2>
        <p class="text-sm text-slate-600 mt-1 mb-4">Choose a new avatar and click save.</p>

        <div class="grid grid-cols-4 sm:grid-cols-6 gap-3 max-h-80 overflow-y-auto mb-4">
          <label
            v-for="img in avatars"
            :key="img"
            class="cursor-pointer"
          >
            <img
              :src="`/avatars/${img}`"
              :class="[
                'rounded-lg border-4 w-14 h-14 object-cover',
                avatarDraft === img ? 'border-indigo-600' : 'border-transparent'
              ]"
            >
            <input v-model="avatarDraft" type="radio" class="hidden" :value="img">
          </label>
        </div>

        <p v-if="avatarError" class="text-sm text-red-600 mb-4">{{ avatarError }}</p>

        <div class="flex justify-end gap-2">
          <button class="px-4 py-2 rounded border" @click="closeAvatarModal">Cancel</button>
          <button
            class="px-4 py-2 rounded bg-[var(--reorbit-blue)] text-white disabled:opacity-50"
            :disabled="savingAvatar"
            @click="saveAvatar"
          >
            {{ savingAvatar ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="showUsernameModal"
      class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      @click.self="closeUsernameModal"
    >
      <div class="bg-white rounded-xl max-w-xl w-full p-6 text-slate-900">
        <h2 class="text-xl font-bold text-[var(--reorbit-blue)]">Change Username</h2>
        <p class="text-sm text-slate-600 mt-1 mb-4">Pick from the Cartoon Orbit username builder.</p>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          <select v-model="part1" class="border rounded-lg p-2">
            <option v-for="w in wordLists[0]" :key="`s-1-${w}`" :value="w">{{ w }}</option>
          </select>
          <select v-model="part2" class="border rounded-lg p-2">
            <option v-for="w in wordLists[1]" :key="`s-2-${w}`" :value="w">{{ w }}</option>
          </select>
          <select v-model="part3" class="border rounded-lg p-2">
            <option v-for="w in wordLists[2]" :key="`s-3-${w}`" :value="w">{{ w }}</option>
          </select>
        </div>

        <button @click="randomize" class="text-sm text-indigo-600 hover:underline mb-4">🔄 Randomize</button>

        <p v-if="usernameError" class="text-sm text-red-600 mb-4">{{ usernameError }}</p>

        <div class="flex justify-end gap-2">
          <button class="px-4 py-2 rounded border" @click="closeUsernameModal">Cancel</button>
          <button
            class="px-4 py-2 rounded bg-[var(--reorbit-purple)] text-white disabled:opacity-50"
            :disabled="savingUsername"
            @click="saveUsername"
          >
            {{ savingUsername ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ title: 'Settings', middleware: 'auth', layout: 'default' })

import { ref, onMounted } from 'vue'

const { user, fetchSelf } = useAuth()

const allow   = ref(true)
const saving  = ref(false)
const loading = ref(true)
const error   = ref('')
const avatars = ref([])

const showAvatarModal = ref(false)
const showUsernameModal = ref(false)
const avatarDraft = ref('')
const savingAvatar = ref(false)
const avatarError = ref('')

const savingUsername = ref(false)
const usernameError = ref('')

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

function sample (arr) { return arr[Math.floor(Math.random() * arr.length)] }
function randomize () {
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

async function openAvatarModal () {
  avatarError.value = ''
  if (!avatars.value.length) {
    avatars.value = await $fetch('/api/avatars', { credentials: 'include' })
  }
  avatarDraft.value = user.value?.avatar || ''
  showAvatarModal.value = true
}

function closeAvatarModal () {
  showAvatarModal.value = false
}

async function saveAvatar () {
  avatarError.value = ''
  if (!avatarDraft.value) {
    avatarError.value = 'Please select an avatar.'
    return
  }

  savingAvatar.value = true
  try {
    await $fetch('/api/auth/set-avatar', {
      method: 'POST',
      body: { avatar: avatarDraft.value },
      credentials: 'include'
    })
    await fetchSelf({ force: true })
    closeAvatarModal()
  } catch (e) {
    avatarError.value = e?.data?.statusMessage || 'Could not save avatar.'
  } finally {
    savingAvatar.value = false
  }
}

function openUsernameModal () {
  usernameError.value = ''
  randomize()
  showUsernameModal.value = true
}

function closeUsernameModal () {
  showUsernameModal.value = false
}

async function saveUsername () {
  usernameError.value = ''
  const username = `${part1.value}${part2.value}${part3.value}`
  savingUsername.value = true
  try {
    await $fetch('/api/auth/set-username', {
      method: 'POST',
      body: { username },
      credentials: 'include'
    })
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
