export const useNewsiteLayout = () => {
  const sidebarMiddleComponent = useState('newsiteSidebarMiddle', () => null)

  const setSidebarMiddle = (componentName) => {
    sidebarMiddleComponent.value = componentName
  }

  const clearSidebarMiddle = () => {
    sidebarMiddleComponent.value = null
  }

  return { sidebarMiddleComponent, setSidebarMiddle, clearSidebarMiddle }
}
