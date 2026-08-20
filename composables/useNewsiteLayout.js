export const useNewsiteLayout = () => {
  const sidebarMiddleComponent = useState('newsiteSidebarMiddle', () => null)
  const mobileSidebarCollapsed = useState('newsiteMobileSidebarCollapsed', () => true)

  // Discord chat panel.
  //
  // Deliberately orthogonal to both of its neighbours:
  //
  //  • `sidebarMiddleComponent` keeps tracking the route underneath. Chat is not
  //    a ninth value of it, because 35 pages call setSidebarMiddle()/
  //    clearSidebarMiddle() at the top level of setup — so a chat "value" would
  //    be clobbered by the next navigation. Closing chat therefore reveals
  //    whatever sidebar the current page set, with no special-casing.
  //  • `mobileSidebarCollapsed` must not touch it either. On mobile the chat
  //    renders in a teleported sheet rather than inside the sidebar, precisely
  //    so the existing "Hide Sidebar" button cannot unmount it (the sidebar
  //    body is behind a v-if) and so the two buttons can never fight over one
  //    piece of visible state.
  //
  // Plain useState, no localStorage: nothing else in composables/ persists, and
  // reading localStorage during setup would mismatch on SSR.
  const chatOpen = useState('newsiteChatOpen', () => false)

  const setSidebarMiddle = (componentName) => {
    sidebarMiddleComponent.value = componentName
  }

  const clearSidebarMiddle = () => {
    sidebarMiddleComponent.value = null
  }

  const toggleChat = () => {
    chatOpen.value = !chatOpen.value
  }

  return {
    sidebarMiddleComponent,
    setSidebarMiddle,
    clearSidebarMiddle,
    mobileSidebarCollapsed,
    chatOpen,
    toggleChat
  }
}
