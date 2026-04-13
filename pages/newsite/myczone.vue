<script setup>
// Redirect to the new URL-based cZone route
definePageMeta({ layout: false, middleware: 'newsite' })

const { user } = useAuth()
const router = useRouter()

onMounted(() => {
  if (user.value?.username) {
    router.replace(`/newsite/czone/${user.value.username}`)
  }
})
</script>
