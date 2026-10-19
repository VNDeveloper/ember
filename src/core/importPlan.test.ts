import { describe, expect, it } from 'vitest'
import { newHabit } from './habits'
import {
  addedText, defaultPicks, detectKind, goalMarkdown, goalPrompt, matchPlan, msKey, nextStepsPrompt, normTitle, parseEstimate,
  parseGoal, parseHabit, parseTasks, pickSummary, stepKey, summaryText, taskKey, tasksPrompt, togglePick, type TaskPlan,
} from './importPlan'
import { goalFixture } from './test-fixtures'

export const SAMPLE = [
  'Sure! Here is your plan:',
  '',
  '```markdown',
  '# Goal: Speak conversational Spanish',
  '**Outcome:** Hold a 15-minute conversation with a native speaker',
  'Finish by: 2027-01-31',
  'Habit: 25m on 5 days a week',
  '',
  '## Milestone 1: Sounds and greetings',
  '- [x] Learn the alphabet and vowel sounds (45m)',
  '- [ ] Practise 20 greetings out loud (1h)',
  '* Shadow a short dialogue — 30 min',
  '',
  '## Phase 2 — Everyday conversation',
  '1. **Learn** the 100 most common verbs (2h 30m)',
  '2. Order food in a role-play',
  '',
  '## Real conversations (6h)',
  '```',
  '',
  'Good luck — you can do it!',
].join('\n')

describe('parseEstimate', () => {
  it.each([
    ['45m', 45], ['1h', 60], ['1h 30m', 90], ['90 min', 90], ['1.5h', 90], ['~2 hours', 120],
    ['45 minutes', 45], ['1 hour 15 minutes', 75], ['about 20 mins', 20], ['2h30m', 150],
  ])('%s → %i', (s, n) => expect(parseEstimate(s)).toBe(n))
  it.each(['', 'soon', '3', 'optional', '0m'])('%s → null', (s) => expect(parseEstimate(s)).toBeNull())
})

describe('parseHabit', () => {
  it.each([
    ['25m on 5 days a week', 25, 5], ['30 min on 3 days per week', 30, 3], ['20 minutes a day', 20, 7],
    ['15m daily', 15, 7], ['25m every day', 25, 7], ['45m on 1 day a week', 45, 1], ['22m on 4 days a week', 20, 4],
  ])('%s', (s, minutes, daysPerWeek) => expect(parseHabit(s)).toEqual({ minutes, daysPerWeek }))
  it.each(['often', '2m daily', '300m daily', '25m on 9 days a week', '5 days a week'])('%s → null', (s) =>
    expect(parseHabit(s)).toBeNull())
})

describe('normTitle', () => {
  it('ignores case, markers, spacing and trailing punctuation', () => {
    expect(normTitle('  **Learn**   the  Alphabet. ')).toBe('learn the alphabet')
    expect(normTitle('`Verbs`:')).toBe('verbs')
  })
})

describe('detectKind', () => {
  it('tells a goal from a task list by the first heading', () => {
    expect(detectKind('Sure!\n# Tasks\n- a')).toBe('tasks')
    expect(detectKind('## Task list\n- a')).toBe('tasks')
    expect(detectKind('# Goal: Spanish\n## Basics')).toBe('goal')
    expect(detectKind('## Task 1: set up\n- a')).toBe('goal')
    expect(detectKind('- a\n- b')).toBeNull()
  })
})

describe('parseGoal', () => {
  it('reads the title, fields, milestones, steps, estimates and done marks, ignoring the chatter', () => {
    const p = parseGoal(SAMPLE)!
    expect(p.title).toBe('Speak conversational Spanish')
    expect(p.outcome).toBe('Hold a 15-minute conversation with a native speaker')
    expect(p.finishBy).toBe('2027-01-31')
    expect(p.habit).toEqual({ minutes: 25, daysPerWeek: 5 })
    expect(p.milestones.map((m) => [m.title, m.estMin])).toEqual([
      ['Sounds and greetings', null], ['Everyday conversation', null], ['Real conversations', 360],
    ])
    expect(p.milestones[0].steps.map((s) => [s.title, s.estMin, s.done])).toEqual([
      ['Learn the alphabet and vowel sounds', 45, true],
      ['Practise 20 greetings out loud', 60, false],
      ['Shadow a short dialogue', 30, false],
    ])
    expect(p.milestones[1].steps.map((s) => [s.title, s.estMin])).toEqual([
      ['Learn the 100 most common verbs', 150], ['Order food in a role-play', 50],
    ])
    expect(p.skipped).toEqual([])
  })

  it("skips what it can't read and says why", () => {
    const p = parseGoal([
      '# Learn piano', 'Finish by: next spring', 'Habit: often', '## Basics (2h)',
      '- Scales (20m)', '  - C major', '- Scales', `- ${'x'.repeat(250)}`,
    ].join('\n'))!
    expect(p.title).toBe('Learn piano')
    expect(p.finishBy).toBeNull()
    expect(p.habit).toBeNull()
    expect(p.milestones[0].estMin).toBeNull()
    expect(p.milestones[0].steps.map((s) => s.title.length)).toEqual([6, 200])
    expect(p.skipped.map((s) => [s.line, s.reason])).toEqual([
      [2, 'not a date — use YYYY-MM-DD'],
      [3, "couldn't read the habit — use ‘25m on 5 days a week’"],
      [4, 'milestone estimate ignored — it has steps'],
      [6, "sub-points aren't imported — make them steps"],
      [7, 'duplicate step'],
      [8, 'title cut to 200 characters'],
    ])
  })

  it('puts bullets before the first milestone into "Getting started" and clamps estimates', () => {
    const p = parseGoal('# Goal: Draw\n- Buy a sketchbook (2m)\n- Draw every object in the kitchen (12h)\n')!
    expect(p.milestones.map((m) => m.title)).toEqual(['Getting started'])
    expect(p.milestones[0].steps.map((s) => s.estMin)).toEqual([5, 480])
  })

  it('needs a heading; without a # line the title is empty', () => {
    expect(parseGoal('Here are some ideas:\n- one\n- two')).toBeNull()
    const p = parseGoal('## Next phase\n- Read chapter 4 (1h)')!
    expect(p.title).toBe('')
    expect(p.milestones[0].steps[0]).toMatchObject({ title: 'Read chapter 4', estMin: 60 })
  })

  it('stops at the limits', () => {
    const many = parseGoal(['# G', ...Array.from({ length: 32 }, (_, i) => `## M${i}`)].join('\n'))!
    expect(many.milestones).toHaveLength(30)
    expect(many.skipped.map((s) => s.reason)).toEqual(['more than 30 milestones', 'more than 30 milestones'])
    const steps = parseGoal(['# G', '## M', ...Array.from({ length: 301 }, (_, i) => `- s${i}`)].join('\n'))!
    expect(steps.milestones[0].steps).toHaveLength(300)
    expect(steps.skipped.map((s) => s.reason)).toEqual(['more than 300 steps'])
    const long = parseGoal(`# G\n${'x'.repeat(60_000)}`)!
    expect(long.skipped.at(-1)!.reason).toBe('paste cut at 50 000 characters')
  })
})

const TODAY = '2026-09-23'

describe('parseTasks', () => {
  const GOALS = [
    goalFixture('Speak conversational Spanish', [['M', []]]),
    { ...goalFixture('Old', [['M', []]]), deletedOn: '2026-09-01' },
  ]
  const fields = (t: TaskPlan) => ({ title: t.title, date: t.date, deadline: t.deadline, tag: t.tag, goalId: t.goalId, notes: t.notes })

  it('reads each part in any order', () => {
    const { tasks, skipped } = parseTasks([
      '# Tasks',
      '- Book a trial lesson | tomorrow | #Admin | goal: speak conversational spanish',
      '- [ ] Renew passport | deadline | 2026-11-02',
      '- Read about plateaus',
      '- Pay the bill | 2026-09-01 | deadline',
    ].join('\n'), GOALS, TODAY)
    expect(tasks.map(fields)).toEqual([
      { title: 'Book a trial lesson', date: '2026-09-24', deadline: false, tag: 'Admin', goalId: 'Speak conversational Spanish', notes: [] },
      { title: 'Renew passport', date: '2026-11-02', deadline: true, tag: 'Inbox', goalId: null, notes: [] },
      { title: 'Read about plateaus', date: null, deadline: false, tag: 'Inbox', goalId: null, notes: [] },
      { title: 'Pay the bill', date: TODAY, deadline: true, tag: 'Inbox', goalId: null, notes: [] },
    ])
    expect(skipped).toEqual([])
  })

  it('notes what it could not use and skips done and nested items', () => {
    const { tasks, skipped } = parseTasks([
      '- Call mum | someday | deadline',
      '- Water plants | soonish | 2026-02-30',
      '- Plan trip | goal: Old',
      '  - pick dates',
      '- [x] Already sorted',
    ].join('\n'), GOALS, TODAY)
    expect(tasks.map((t) => t.notes)).toEqual([
      ['deadline needs a date'],
      ["didn't understand ‘soonish’", "‘2026-02-30’ isn't a date"],
      ['no goal called ‘Old’ — added without a goal'],
    ])
    expect(tasks[0].deadline).toBe(false)
    expect(skipped.map((s) => [s.line, s.reason])).toEqual([[4, "sub-points aren't imported — make them tasks"], [5, 'already done']])
  })

  it('stops at 100 tasks', () => {
    const { tasks, skipped } = parseTasks(Array.from({ length: 101 }, (_, i) => `- t${i}`).join('\n'), [], TODAY)
    expect(tasks).toHaveLength(100)
    expect(skipped.map((s) => s.reason)).toEqual(['more than 100 tasks'])
  })
})

describe('paste-back', () => {
  const spanish = () => ({
    ...goalFixture('Spanish', [['Sounds and greetings', [['Learn the alphabet and vowel sounds', '2026-09-01']]]]),
    outcome: 'Chat for 15 minutes',
  })

  it('matches milestones and steps by title and fills only what the goal lacks', () => {
    const m = matchPlan(spanish(), parseGoal(SAMPLE)!)
    expect(m.milestones.map((x) => x.msId)).toEqual(['Spanish/Sounds and greetings', null, null])
    expect(m.milestones[0].steps).toEqual(['there', 'new', 'new'])
    expect(m.milestones[1].steps).toEqual(['new', 'new'])
    expect([m.outcome, m.finishBy, m.habit]).toEqual(['kept', 'fill', 'fill'])
    expect(matchPlan(spanish(), parseGoal('## Sounds and greetings\n- New one')!).finishBy).toBe('none')
  })

  it('ticks everything new; ticking follows the milestone; "already there" never ticks', () => {
    const plan = parseGoal(SAMPLE)!
    const m = matchPlan(spanish(), plan)
    let picks = defaultPicks(plan, m)
    expect(picks.has(stepKey(0, 0))).toBe(false)
    expect(pickSummary(plan, picks, m)).toEqual({ milestones: 2, steps: 4, minutes: 650, there: 1 })
    expect(summaryText(pickSummary(plan, picks, m), true)).toBe('4 new steps · 2 new milestones · 1 already there')
    picks = togglePick(picks, msKey(1), plan, m)
    expect([...picks].filter((k) => k.startsWith('m1'))).toEqual([])
    picks = togglePick(picks, stepKey(1, 0), plan, m)
    expect(picks.has(msKey(1))).toBe(true)
    expect(picks.has(stepKey(1, 1))).toBe(false)
    expect(togglePick(picks, stepKey(0, 0), plan, m).has(stepKey(0, 0))).toBe(false)
    expect(togglePick(new Set([taskKey(0)]), taskKey(0), null, null).size).toBe(0)
  })

  it('sums a new goal and words what an import adds', () => {
    const plan = parseGoal(SAMPLE)!
    expect(summaryText(pickSummary(plan, defaultPicks(plan, null), null), false)).toBe('3 milestones · 5 steps · ~11h 35m')
    expect(addedText(5, 1)).toBe('5 steps and 1 milestone')
    expect(addedText(1, 0)).toBe('1 step')
    expect(addedText(0, 2)).toBe('2 milestones')
  })
})

describe('copy out and prompts', () => {
  it('writes a goal out and reads back the same, so pasting it back adds nothing', () => {
    const g = goalFixture('Spanish', [['Basics', [['Alphabet', '2026-09-01'], ['Greetings', null], ['Gone', null]]], ['Later', []], ['Dropped', []]])
    g.outcome = 'Chat\nfor 15 minutes'
    g.finishBy = '2027-01-31'
    g.milestones[0].steps[1].estMin = 75
    g.milestones[0].steps[2].deletedOn = TODAY
    g.milestones[1].estMin = 240
    g.milestones[2].deletedOn = TODAY
    g.habit = newHabit(25, 7, TODAY, false)
    const md = goalMarkdown(g)
    expect(md).toBe([
      '# Goal: Spanish', 'Outcome: Chat for 15 minutes', 'Finish by: 2027-01-31', 'Habit: 25m every day',
      '', '## Basics', '- [x] Alphabet (50m)', '- [ ] Greetings (1h 15m)', '', '## Later (~4h)', '',
    ].join('\n'))
    const back = parseGoal(md)!
    expect(back.title).toBe('Spanish')
    expect(back.habit).toEqual({ minutes: 25, daysPerWeek: 7 })
    expect(back.milestones.map((m) => [m.title, m.estMin, m.steps.map((s) => [s.title, s.estMin, s.done])])).toEqual([
      ['Basics', null, [['Alphabet', 50, true], ['Greetings', 75, false]]], ['Later', 240, []],
    ])
    const match = matchPlan(g, back)
    expect(match.milestones.every((x) => x.msId !== null && x.steps.every((s) => s === 'there'))).toBe(true)
    expect(pickSummary(back, defaultPicks(back, match), match)).toMatchObject({ milestones: 0, steps: 0 })
  })

  it('builds prompts with the fill-in line, the rules and today', () => {
    const p = goalPrompt(TODAY)
    expect(p.split('\n')[0]).toBe('My goal: [describe it — what, by when, how much time a week]')
    expect(p).toContain('# Goal: ')
    expect(p).toContain('Today is 2026-09-23.')
    expect(parseGoal(p)!.milestones.length).toBeGreaterThan(0)
    const g = goalFixture('Spanish', [['Basics', [['Alphabet', null]]]])
    const n = nextStepsPrompt(g, TODAY)
    expect(n.split('\n')[0]).toBe('What I want next: [e.g. plan the next phase, or break down milestones without steps]')
    expect(n).toContain(goalMarkdown(g))
    expect(n).toContain('Keep my existing milestones and steps exactly as written')
    const done = { ...goalFixture('Done', []), status: 'achieved' as const }
    const t = tasksPrompt([g, done, { ...goalFixture('Gone', []), deletedOn: TODAY }], TODAY)
    expect(t.split('\n')[0]).toBe('What I need to do: [list or describe it]')
    expect(t).toContain('- Spanish')
    expect(t).not.toContain('Gone')
    expect(t).not.toContain('- Done')
    expect(tasksPrompt([], TODAY)).toContain('leave out "goal:"')
  })
})
