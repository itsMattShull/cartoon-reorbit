export const useNewsiteLayout = () => {
  const sidebarMiddleComponent = useState('newsiteSidebarMiddle', () => null)
  const mobileSidebarCollapsed = useState('newsiteMobileSidebarCollapsed', () => true)

  const setSidebarMiddle = (componentName) => {
    sidebarMiddleComponent.value = componentName
  }

  const clearSidebarMiddle = () => {
    sidebarMiddleComponent.value = null
  }

  return { sidebarMiddleComponent, setSidebarMiddle, clearSidebarMiddle, mobileSidebarCollapsed }
}
