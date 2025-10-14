import { ref } from 'vue'

const wishlist  = ref([])
const loading   = ref(true)
const hasLoaded = ref(false)

export function useWishlist() {
  if (!hasLoaded.value) {
    hasLoaded.value = true
    loading.value   = true
    $fetch('/api/wishlist')
      .then(data => { wishlist.value = (data || []).map(ct => ct.id) })
      .catch(err => { console.error('Failed to load wishlist:', err) })
      .finally(() => { loading.value = false })
  }

  async function add(ctoonId, offeredPoints) {
    await $fetch(`/api/wishlist/${ctoonId}`, {
      method: 'POST',
      body: { offeredPoints }
    })
    if (!wishlist.value.includes(ctoonId)) wishlist.value.push(ctoonId)
  }

  async function remove(ctoonId) {
    await $fetch(`/api/wishlist/${ctoonId}`, { method: 'DELETE' })
    wishlist.value = wishlist.value.filter(id => id !== ctoonId)
  }

  return { wishlist, loading, add, remove }
}
