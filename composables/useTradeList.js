import { ref } from 'vue'

const tradeList = ref([])
const loading = ref(true)
const hasLoaded = ref(false)

export function useTradeList() {
  if (!hasLoaded.value) {
    hasLoaded.value = true
    loading.value = true
    $fetch('/api/trade-list')
      .then(data => {
        tradeList.value = (data || []).map(item => item.userCtoonId)
      })
      .catch(err => { console.error('Failed to load trade list:', err) })
      .finally(() => { loading.value = false })
  }

  async function add(userCtoonId) {
    await $fetch(`/api/trade-list/${userCtoonId}`, { method: 'POST' })
    if (!tradeList.value.includes(userCtoonId)) tradeList.value.push(userCtoonId)
  }

  async function remove(userCtoonId) {
    await $fetch(`/api/trade-list/${userCtoonId}`, { method: 'DELETE' })
    tradeList.value = tradeList.value.filter(id => id !== userCtoonId)
  }

  return { tradeList, loading, add, remove }
}
