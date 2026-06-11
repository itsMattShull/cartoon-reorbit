<template>
  <div class="stw-container">
    <h1 class="stw-title">Spin the Wheel</h1>

    <!-- Admin controls -->
    <div v-if="isAdmin" class="stw-buttons">
      <button
        class="stw-btn stw-btn-allow"
        :disabled="wheelState.isOpen || wheelState.spinning"
        @click="allowJoin"
      >
        Allow
      </button>
      <button
        class="stw-btn stw-btn-clear"
        :disabled="wheelState.spinning || (!wheelState.isOpen && wheelState.participants.length === 0)"
        @click="clearWheel"
      >
        Clear
      </button>
      <button
        class="stw-btn stw-btn-spin"
        :disabled="wheelState.participants.length === 0 || wheelState.spinning"
        @click="spinWheel"
      >
        Spin
      </button>
    </div>

    <!-- Non-admin controls -->
    <div v-else class="stw-buttons">
      <button
        class="stw-btn stw-btn-join"
        :disabled="!wheelState.isOpen || wheelState.spinning || hasJoined"
        @click="joinWheel"
      >
        Join
      </button>
      <span class="stw-status-msg">
        <template v-if="wheelState.spinning">Wheel is spinning...</template>
        <template v-else-if="hasJoined">You are on the wheel!</template>
        <template v-else-if="!wheelState.isOpen">Waiting for the host to open joining...</template>
        <template v-else>Click Join to add yourself to the wheel!</template>
      </span>
    </div>

    <!-- Participant count -->
    <p class="stw-count">
      {{ wheelState.participants.length }}
      participant{{ wheelState.participants.length !== 1 ? 's' : '' }}
    </p>

    <!-- Wheel -->
    <div class="stw-wheel-wrapper">
      <canvas ref="wheelCanvas" class="stw-canvas" :width="canvasSize" :height="canvasSize" />
    </div>
  </div>

  <!-- Winner modal -->
  <Teleport to="body">
    <div v-if="winner" class="stw-modal-backdrop" @click.self="dismissWinner">
      <div class="stw-modal">
        <div class="stw-modal-header">Winner!</div>
        <div class="stw-modal-winner">{{ winner }}</div>
        <button class="stw-btn stw-btn-dismiss" @click="dismissWinner">Dismiss</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { io } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'Spin the Wheel',
  description: 'Spin the wheel on Cartoon ReOrbit for a chance to win points and prizes.'
})

const { user, fetchSelf, isAdmin } = useAuth()
const runtime = useRuntimeConfig()

const wheelState = ref({
  participants: [],
  isOpen: false,
  sessionId: '',
  spinning: false
})

const winner = ref(null)
const wheelCanvas = ref(null)
const canvasSize = ref(480)
const currentAngle = ref(0)

let socket = null
let animationFrameId = null
let spinStartTime = null
let spinStartAngle = 0
let spinTargetAngle = 0
const SPIN_DURATION = 6500

const WHEEL_COLORS = [
  '#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6',
  '#1ABC9C', '#E67E22', '#E91E63', '#00BCD4', '#8BC34A',
  '#FF5722', '#FF9800', '#795548', '#607D8B', '#D35400',
  '#27AE60', '#2980B9', '#8E44AD', '#16A085', '#C0392B'
]

const hasJoined = computed(() =>
  wheelState.value.participants.some(p => p.username === user.value?.username)
)

function initSocket() {
  socket = io(
    import.meta.env.PROD
      ? undefined
      : `http://localhost:${runtime.public.socketPort}`,
    { reconnectionDelayMax: 5000 }
  )

  socket.on('connect', () => {
    socket.emit('stw:subscribe')
  })

  socket.on('stw:state', (state) => {
    wheelState.value = state
    if (!wheelState.value.spinning && !animationFrameId) {
      drawWheel()
    }
  })

  socket.on('stw:spinning', (state) => {
    wheelState.value = { ...state, spinning: true }
    startSpinAnimation(state.winnerIdx)
  })

  socket.on('stw:winner', ({ username }) => {
    winner.value = username
  })

  socket.on('stw:error', ({ message }) => {
    console.warn('[stw]', message)
  })
}

function startSpinAnimation(winnerIdx) {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  const n = wheelState.value.participants.length
  if (n === 0) return

  const segSize = (2 * Math.PI) / n
  // Angle where winner center lands at the top peg (angle 0 from top)
  let target = -(winnerIdx + 0.5) * segSize
  // Add full rotations until we are at least 5 full spins ahead of current angle
  const minTarget = currentAngle.value + 5 * 2 * Math.PI
  while (target < minTarget) target += 2 * Math.PI

  spinStartAngle = currentAngle.value
  spinTargetAngle = target
  spinStartTime = null

  function animate(timestamp) {
    if (!spinStartTime) spinStartTime = timestamp
    const elapsed = timestamp - spinStartTime
    const progress = Math.min(elapsed / SPIN_DURATION, 1)
    // Cubic ease-out
    const eased = 1 - Math.pow(1 - progress, 3)
    currentAngle.value = spinStartAngle + (spinTargetAngle - spinStartAngle) * eased
    drawWheel()
    if (progress < 1) {
      animationFrameId = requestAnimationFrame(animate)
    } else {
      currentAngle.value = spinTargetAngle
      animationFrameId = null
      drawWheel()
    }
  }

  animationFrameId = requestAnimationFrame(animate)
}

function drawWheel() {
  const canvas = wheelCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const size = canvasSize.value
  const cx = size / 2
  const cy = size / 2
  const r = cx - 35

  ctx.clearRect(0, 0, size, size)

  const participants = wheelState.value.participants
  const n = participants.length

  // Outer rim
  ctx.beginPath()
  ctx.arc(cx, cy, r + 6, 0, 2 * Math.PI)
  ctx.fillStyle = '#1e293b'
  ctx.fill()
  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 3
  ctx.stroke()

  if (n === 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, 2 * Math.PI)
    ctx.fillStyle = '#0f172a'
    ctx.fill()
    ctx.fillStyle = '#64748b'
    ctx.font = '15px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('No participants yet', cx, cy)
    drawPeg(ctx, cx, cy, r)
    return
  }

  const segSize = (2 * Math.PI) / n
  const startBase = currentAngle.value - Math.PI / 2

  for (let i = 0; i < n; i++) {
    const startAngle = startBase + i * segSize
    const endAngle = startBase + (i + 1) * segSize

    // Segment
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, startAngle, endAngle)
    ctx.closePath()
    ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length]
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Label
    const midAngle = startAngle + segSize / 2
    const maxTextWidth = r * 0.62
    const fontSize = Math.max(9, Math.min(15, (r * segSize) / 4.5))

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(midAngle)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur = 3

    let label = participants[i].username
    while (label.length > 2 && ctx.measureText(label).width > maxTextWidth) {
      label = label.slice(0, -1)
    }
    if (label !== participants[i].username) label += '…'

    ctx.fillText(label, r - 10, 0)
    ctx.restore()
  }

  // Center hub
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22)
  grad.addColorStop(0, '#334155')
  grad.addColorStop(1, '#0f172a')
  ctx.beginPath()
  ctx.arc(cx, cy, 22, 0, 2 * Math.PI)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 2
  ctx.stroke()

  drawPeg(ctx, cx, cy, r)
}

function drawPeg(ctx, cx, cy, r) {
  const tipY = cy - r + 6
  const baseY = cy - r - 26
  const halfW = 13

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2

  ctx.beginPath()
  ctx.moveTo(cx, tipY)
  ctx.lineTo(cx - halfW, baseY)
  ctx.lineTo(cx + halfW, baseY)
  ctx.closePath()
  ctx.fillStyle = '#FFD700'
  ctx.fill()
  ctx.strokeStyle = '#B8860B'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.restore()
}

async function allowJoin() { socket?.emit('stw:allow') }
async function clearWheel() { socket?.emit('stw:clear') }
async function spinWheel() { socket?.emit('stw:spin') }
async function joinWheel() { socket?.emit('stw:join') }
function dismissWinner() { winner.value = null }

onMounted(async () => {
  await fetchSelf()
  await nextTick()
  initSocket()
  drawWheel()
})

onUnmounted(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  socket?.disconnect()
  socket = null
})

watch(
  () => [wheelState.value.participants.length, wheelState.value.sessionId],
  () => {
    if (!animationFrameId) drawWheel()
  }
)
</script>

<style scoped>
.stw-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px;
  min-height: 100%;
  box-sizing: border-box;
}

.stw-title {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0 0 20px;
  text-align: center;
}

.stw-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: 12px;
}

.stw-btn {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
  outline: none;
}

.stw-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.stw-btn:not(:disabled):hover {
  opacity: 0.88;
  transform: translateY(-1px);
}

.stw-btn:not(:disabled):active {
  transform: translateY(0);
}

.stw-btn-allow {
  background: #22c55e;
  color: #fff;
}

.stw-btn-clear {
  background: #ef4444;
  color: #fff;
}

.stw-btn-spin {
  background: #3b82f6;
  color: #fff;
}

.stw-btn-join {
  background: #f59e0b;
  color: #1a1a1a;
  font-size: 1.05rem;
  padding: 12px 32px;
}

.stw-btn-dismiss {
  background: #475569;
  color: #fff;
  margin-top: 12px;
}

.stw-status-msg {
  font-size: 0.9rem;
  color: #94a3b8;
}

.stw-count {
  font-size: 0.95rem;
  color: #64748b;
  margin: 0 0 16px;
}

.stw-wheel-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  max-width: 520px;
}

.stw-canvas {
  max-width: 100%;
  height: auto;
  display: block;
}

/* Winner modal */
</style>

<style>
.stw-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.stw-modal {
  background: #1e293b;
  border: 2px solid #FFD700;
  border-radius: 16px;
  padding: 40px 48px;
  text-align: center;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(255, 215, 0, 0.2);
  animation: stw-pop-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.stw-modal-header {
  font-size: 1.5rem;
  font-weight: 700;
  color: #FFD700;
  margin-bottom: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.stw-modal-winner {
  font-size: 2.2rem;
  font-weight: 800;
  color: #f1f5f9;
  margin-bottom: 20px;
  word-break: break-word;
}

@keyframes stw-pop-in {
  from { opacity: 0; transform: scale(0.7); }
  to   { opacity: 1; transform: scale(1); }
}
</style>
