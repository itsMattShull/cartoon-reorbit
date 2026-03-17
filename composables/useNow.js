import { onMounted, onUnmounted } from 'vue'

let subscribers = 0
let intervalId = null

export function useNow () {
  const now   = useState('shared:now',   () => new Date())
  const nowTs = useState('shared:nowTs', () => Date.now())

  const tick = () => {
    const d = new Date()
    now.value   = d
    nowTs.value = d.getTime()
  }

  onMounted(() => {
    subscribers++
    if (subscribers === 1) intervalId = setInterval(tick, 1000)
  })

  onUnmounted(() => {
    subscribers--
    if (subscribers === 0 && intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  })

  return { now, nowTs }
}
