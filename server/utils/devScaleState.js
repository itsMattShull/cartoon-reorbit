let scaleUpUntil = null
let downsizeTimer = null
let scaleInProgress = false

export function getScaleUpUntil() {
  if (scaleUpUntil && scaleUpUntil <= Date.now()) {
    scaleUpUntil = null
  }
  return scaleUpUntil
}

export function setScaleUpUntil(value) {
  scaleUpUntil = value
}

export function scheduleDownsize(callback, delayMs) {
  if (downsizeTimer) clearTimeout(downsizeTimer)
  downsizeTimer = setTimeout(async () => {
    downsizeTimer = null
    await callback()
  }, delayMs)
}

export function clearDownsizeSchedule() {
  if (downsizeTimer) {
    clearTimeout(downsizeTimer)
    downsizeTimer = null
  }
}

export function getScaleInProgress() {
  return scaleInProgress
}

export function setScaleInProgress(value) {
  scaleInProgress = value
}
