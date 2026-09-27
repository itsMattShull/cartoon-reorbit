// server/api/cmoon-season.get.js
// Public, unauthenticated feed for the seasonal-updates section on the bottom half of the cMoon
// navigation page (components/newsite/CMoonNav.vue). No cMoonEnabled gate here unlike most other
// cMoon public endpoints — a visitor lands on this page specifically to see cMoon info, and an
// empty tracker/cmoon list already renders an empty section harmlessly.
import { defineEventHandler } from 'h3'
import { computeSeasonProgress } from '@/server/utils/cmoonSeason'

export default defineEventHandler(async () => {
  const { config, trackers } = await computeSeasonProgress()
  return {
    header: config.header,
    startedAt: config.startedAt,
    blurb: config.blurb,
    trackers,
  }
})
