export const useNewsiteLayout = () => {
  const sidebarMiddleComponent = useState('newsiteSidebarMiddle', () => null)
  const mobileSidebarCollapsed = useState('newsiteMobileSidebarCollapsed', () => true)
  // Set by a page/component that wants the site chrome (top nav bar, sidebar) to take on a
  // color other than the default theme — currently just cZone pages, recoloring to the viewed
  // owner's cMoon color. Null means "use the default theme"; whoever sets this on mount must
  // clear it on unmount so navigating away restores the default for every other page.
  const pageThemeColor = useState('newsitePageThemeColor', () => null)

  const setSidebarMiddle = (componentName) => {
    sidebarMiddleComponent.value = componentName
  }

  const clearSidebarMiddle = () => {
    sidebarMiddleComponent.value = null
  }

  const setPageThemeColor = (color) => {
    pageThemeColor.value = color || null
  }

  const clearPageThemeColor = () => {
    pageThemeColor.value = null
  }

  return {
    sidebarMiddleComponent, setSidebarMiddle, clearSidebarMiddle, mobileSidebarCollapsed,
    pageThemeColor, setPageThemeColor, clearPageThemeColor,
  }
}
