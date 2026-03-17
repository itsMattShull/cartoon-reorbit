// composables/useGraphQL.js
// Minimal GraphQL client composable.
// Sends POST requests to /api/graphql and unwraps data / errors.

export function useGraphQL() {
  async function gql(query, variables = {}) {
    const result = await $fetch('/api/graphql', {
      method: 'POST',
      body: { query, variables }
    })

    if (result.errors?.length) {
      const msg = result.errors.map((e) => e.message).join(', ')
      throw new Error(msg)
    }

    return result.data
  }

  return { gql }
}
