// composables/useWishlist.js
import { ref } from 'vue'

/** module-scope shared state **/
const wishlist  = ref([])
const loading   = ref(true)
const hasLoaded = ref(false)

export function useWishlist() {
  // only fetch once
  if (!hasLoaded.value) {
    hasLoaded.value = true
    loading.value   = true

    $fetch('/api/wishlist')
      .then(data => {
        // data is an array of CToon objects
        wishlist.value = (data || []).map(ct => ct.id)
      })
      .catch(err => {
        console.error('Failed to load wishlist:', err)
      })
      .finally(() => {
        loading.value = false
      })
  }

  // add a cToon
  async function add(ctoonId) {
    await $fetch(`/api/wishlist/${ctoonId}`, { method: 'POST' })
    wishlist.value.push(ctoonId)
  }

  // remove a cToon
  async function remove(ctoonId) {
    await $fetch(`/api/wishlist/${ctoonId}`, { method: 'DELETE' })
    wishlist.value = wishlist.value.filter(id => id !== ctoonId)
  }

  return { wishlist, loading, add, remove }
}
