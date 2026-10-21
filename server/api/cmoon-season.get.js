// server/api/cmoon-season.get.js
// Public, unauthenticated feed for the seasonal-updates section on the bottom half of the cMoon
// navigation page (components/newsite/CMoonNav.vue). No cMoonEnabled gate here unlike most other
// cMoon public endpoints — a visitor lands on this page specifically to see cMoon info, and an
// empty/no-season response already renders an empty section harmlessly.
import { defineEventHandler } from 'h3'
import {
  getCurrentSeason, getNextSeason, getPastSeasons,
  computeSeasonProgress, seasonLeaderboard, seasonRecap,
} from '@/server/utils/cmoonSeasons'

export default defineEventHandler(async () => {
  const [current, next, past] = await Promise.all([
    getCurrentSeason(),
    getNextSeason(),
    getPastSeasons(),
  ])

  const pastSeasons = await Promise.all(past.map(seasonRecap))

  if (!current) {
    return {
      active: false,
      season: null,
      leaderboard: [],
      nextSeasonStartAt: next?.startAt || null,
      pastSeasons,
    }
  }

  const [progress, leaderboard] = await Promise.all([
    computeSeasonProgress(current),
    seasonLeaderboard(current),
  ])

  return {
    active: true,
    season: {
      seasonNumber: current.seasonNumber,
      header: current.header,
      blurb: current.blurb,
      startAt: current.startAt,
      endAt: current.endAt,
      trackers: progress.trackers,
      enemiesGoal: progress.enemiesGoal,
    },
    leaderboard,
    nextSeasonStartAt: null,
    pastSeasons,
  }
})
