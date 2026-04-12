export const useSidebar = () => useState('sidebarConfig', () => ({
  middle: null,      // component name string or null
  middleProps: {},   // props object passed to middle component
  bottom: null,      // component name string or null
}))
