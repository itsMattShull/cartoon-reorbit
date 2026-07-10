// Shared America/Chicago (CST/CDT) <-> UTC conversion for admin forms that
// enter/display date-time fields in Central time (e.g. Manage Codes).
function isoToCSTLocal(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const parts = date.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).split(', ')
  const [m, d, y] = parts[0].split('/')
  const time = parts[1]
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${time}`
}

function cstLocalToISO(localStr) {
  if (!localStr) return null
  const approxUTC = new Date(localStr + ':00Z')
  const cstStr = approxUTC.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).split(', ')
  const [m2, d2, y2] = cstStr[0].split('/')
  const cstEquivStr = `${y2}-${m2}-${d2}T${cstStr[1]}`
  const diffMs = new Date(localStr + ':00Z') - new Date(cstEquivStr + ':00Z')
  return new Date(approxUTC.getTime() + diffMs).toISOString()
}

export function useCentralTime() {
  return { isoToCSTLocal, cstLocalToISO }
}
