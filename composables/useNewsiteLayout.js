export const useNewsiteLayout = () => {
  const sidebarMiddleComponent = useState('newsiteSidebarMiddle', () => null)
  const mobileSidebarCollapsed = useState('newsiteMobileSidebarCollapsed', () => true)

  const setSidebarMiddle = (componentName) => {
    sidebarMiddleComponent.value = componentName
  }

  // Pass `onlyIfComponent` when clearing on unmount: during a route change the incoming page's setup runs
  // before the outgoing page's onBeforeUnmount, so an unconditional clear would wipe the sidebar the new
  // page just set. With it, the clear only happens if the sidebar is still the one this page set.
  const clearSidebarMiddle = (onlyIfComponent) => {
    if (typeof onlyIfComponent === 'string' && sidebarMiddleComponent.value !== onlyIfComponent) return
    sidebarMiddleComponent.value = null
  }

  return { sidebarMiddleComponent, setSidebarMiddle, clearSidebarMiddle, mobileSidebarCollapsed }
}
