import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './helpers/ogGtoonTutorialHarness.js'
import { TUTORIAL_STEPS, settleStepIndex, stageOf, STAGES } from '../utils/ogGtoonTutorialSteps.js'
import { TUTORIAL_PLAN } from '../server/utils/ogGtoonTutorialScript.js'

/* Plays the guided tutorial the way an ideal player would, tapping exactly what each step points at,
 * against the real server module. It checks every step shows up in order, that each is shown only
 * when its target exists, and that following the guide ends in the scripted win — so the step text,
 * the board and the scripted match cannot drift apart unnoticed. */

function newGuide() {
  const h = harness()
  const board = { sel: null, tab: 'log', swapSheetOpen: false, discardPick: [], flipping: false }
  const ctx = () => ({ ...board, m: h.view(), ended: h.sent.some(s => s.ev === 'oggtoons:matchEnd') })
  return { h, board, ctx }
}

/** What a tap on `target` does on the real board (mirrors OgGtoonMatchBoard.vue's handlers). */
async function tap({ h, board, ctx }, target) {
  const c = ctx()
  const stage = stageOf(c)
  let m
  if ((m = /^hand-(\d+)$/.exec(target))) {
    const idx = Number(m[1])
    if (stage === STAGES.DISCARD) board.discardPick = board.discardPick.includes(idx) ? board.discardPick.filter(i => i !== idx) : [...board.discardPick, idx]
    else board.sel = board.sel === idx ? null : idx
    board.tab = 'info' // tapping a hand card also opens the Info tab
  } else if ((m = /^slot-you-(\d+)$/.exec(target))) {
    const slot = Number(m[1])
    if (board.sel !== null) { await h.call('place', { cardIdx: board.sel, slot }); board.sel = null }
    else await h.call('unplace', { slot })
  } else if (target === 'commit') {
    await h.call('commit', { round: c.m.round })
  } else if (target === 'log-tab') {
    board.tab = 'log'
  } else if (target === 'discard-btn') {
    await h.call('discard', { cardIdxs: board.discardPick }); board.discardPick = []
  } else if (target === 'swap-btn') {
    board.swapSheetOpen = true
  } else if (target === 'swap-confirm') {
    await h.call('swap'); board.swapSheetOpen = false
  } else if ((m = /^color-([A-Z]+)$/.exec(target))) {
    await h.call('chooseColor', { color: m[1] })
  } else {
    assert.fail(`the test does not know how to tap "${target}"`)
  }
}

test('guided steps: following every step plays the scripted match to its win', async () => {
  const g = newGuide()
  await g.h.call('start')
  const seen = []
  let idx = 0
  for (let guard = 0; guard < 200; guard++) {
    idx = settleStepIndex(TUTORIAL_STEPS, idx, g.ctx())
    const step = TUTORIAL_STEPS[idx]
    if (!step) break
    assert.ok(step.stage <= stageOf(g.ctx()), `${step.id} is shown before its stage (${step.stage} > ${stageOf(g.ctx())})`)
    assert.ok(!step.ready || step.ready(g.ctx()), `${step.id} is held back, but nothing is playing`)
    seen.push(step.id)
    if (step.kind === 'info') {
      if (step.finish) { idx++; break }
      idx++
    } else {
      assert.equal(typeof step.target, 'string', `${step.id}: an action step points at exactly one thing`)
      await tap(g, step.target)
      assert.ok(step.done(g.ctx()), `${step.id}: tapping its target did not complete it`)
    }
  }
  assert.equal(idx, TUTORIAL_STEPS.length, 'the guide reaches its final step')
  assert.deepEqual(seen, TUTORIAL_STEPS.map(s => s.id), 'every step is shown exactly once, in order')

  const end = g.h.view()
  assert.equal(end.over, true)
  assert.equal(end.won, true)
  assert.equal(end.player1Score, 27)
  assert.equal(end.player2Score, 43)
  assert.deepEqual(g.h.errors(), [], 'the guide never makes the player do something the server refuses')
})

test('guided steps: ids are unique and every action step names one target and a done check', () => {
  assert.equal(new Set(TUTORIAL_STEPS.map(s => s.id)).size, TUTORIAL_STEPS.length)
  for (const s of TUTORIAL_STEPS) {
    assert.ok(s.title && s.text, `${s.id} needs a title and text`)
    if (s.kind === 'action') assert.equal(typeof s.done, 'function', `${s.id} needs done()`)
    else assert.ok(s.button, `${s.id} needs a button`)
  }
  assert.equal(TUTORIAL_STEPS.filter(s => s.finish).length, 1)
  assert.equal(TUTORIAL_STEPS.at(-1).finish, true)
  const stages = TUTORIAL_STEPS.map(s => s.stage)
  assert.deepEqual(stages, [...stages].sort((a, b) => a - b), 'steps are ordered by stage')
})

test('guided steps: the text names the same cards the script places', () => {
  const text = TUTORIAL_STEPS.map(s => `${s.title} ${s.text}`).join(' ')
  for (const name of ['Cindy Bear', 'Yogi Bear', 'Batman', 'Captain Dodgers', 'Jack Training', 'TOM', 'Pepe Le Pew', 'Goat', 'Blossom Fighting']) {
    assert.ok(text.includes(name), `the steps never mention ${name}`)
  }
  // The five "pick" targets of round 1 are the first five deck cards the script plays.
  const hands = TUTORIAL_STEPS.filter(s => /^hand-\d+$/.test(s.target)).map(s => Number(s.target.slice(5)))
  for (const p of [...TUTORIAL_PLAN.rounds[1].user, ...TUTORIAL_PLAN.rounds[2].user]) assert.ok(hands.includes(p.cardIdx))
})

test('guided steps: a refresh mid-match lands on the right step', async () => {
  const g = newGuide()
  await g.h.call('start')
  // Two cards already on the board, nothing selected.
  await g.h.call('place', { cardIdx: 0, slot: 1 })
  await g.h.call('place', { cardIdx: 1, slot: 2 })
  let idx = settleStepIndex(TUTORIAL_STEPS, 0, g.ctx())
  assert.equal(TUTORIAL_STEPS[idx].id, 'welcome', 'info steps are not skipped: they wait for their button')
  // Already-done action steps are skipped over; the next one still to do is Batman.
  idx = TUTORIAL_STEPS.findIndex(s => s.id === 'place-cindy')
  assert.equal(TUTORIAL_STEPS[settleStepIndex(TUTORIAL_STEPS, idx, g.ctx())].id, 'pick-batman')

  // Commit round 1 and jump straight into the discard stage: all of round 1 is skipped.
  await g.h.call('place', { cardIdx: 2, slot: 3 })
  await g.h.call('place', { cardIdx: 3, slot: 4 })
  await g.h.call('commit', { round: 1 })
  assert.equal(stageOf(g.ctx()), STAGES.DISCARD)
  // A refreshed page starts the guide from the top; everything from earlier stages is skipped.
  const afterRound1 = TUTORIAL_STEPS.findIndex(s => s.stage === STAGES.DISCARD)
  assert.equal(settleStepIndex(TUTORIAL_STEPS, 0, g.ctx()), afterRound1)
})
