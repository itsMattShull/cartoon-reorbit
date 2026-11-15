// Stand-in for Nuxt's `#imports` in the client-composable test.
export const useRuntimeConfig = () => ({ public: { socketPort: globalThis.__TEST_PORT } })
