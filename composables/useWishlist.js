// composables/useWishlist.js
import { ref, onMounted } from 'vue'
import { useFetch } from '#app'

export function useWishlist() {
  const wishlist = ref([])
  const loading  = ref(true)

  // load existing wishlist IDs
  async function load() {
    const { data, error } = await useFetch('/api/wishlist')
    if (!error.value) {
      // data.value is Ctoon[] → map to id[]
      wishlist.value = (data.value || []).map(ct => ct.id)
    }
    loading.value = false
  }


  // add a ctoon to the wishlist
  async function add(ctoonId) {
    await $fetch(`/api/wishlist/${ctoonId}`, { method: 'POST' })
    wishlist.value.push(ctoonId)
  }

  // remove a ctoon from the wishlist
  async function remove(ctoonId) {
    await $fetch(`/api/wishlist/${ctoonId}`, { method: 'DELETE' })
    wishlist.value = wishlist.value.filter(id => id !== ctoonId)
  }

  onMounted(load)

  return { wishlist, loading, add, remove }
}
