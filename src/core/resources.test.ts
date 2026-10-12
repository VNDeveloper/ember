import { describe, expect, it } from 'vitest'
import {
  addMonthsClamped, coveredBy, coveringMembership, dueRenewals, goalFilterOptions, goalResources, inDays, libraryKicker, money,
  monthlyCost, moneyLine, nextRenewal, priceText, renewalText, repairResource, repairResources, resourceList, statusCounts, upcomingRenewals,
} from './resources'
import { goalFixture, resourceFixture } from './test-fixtures'

describe('repairResource', () => {
  it('leaves a valid resource unchanged', () => {
    const r = resourceFixture('A', { billing: 'month', price: 49, renewsOn: '2026-10-15', keptFor: '2026-09-15', updatedAt: 5 })
    expect(repairResource(r)).toEqual(r)
  })

  it('drops entries without an id or an http(s) link', () => {
    expect(repairResource(null)).toBeNull()
    expect(repairResource({ ...resourceFixture('A'), id: '' })).toBeNull()
    expect(repairResource({ ...resourceFixture('A'), url: 42 })).toBeNull()
    expect(repairResource({ ...resourceFixture('A'), url: 'javascript:alert(1)' })).toBeNull()
    expect(repairResource({ ...resourceFixture('A'), url: 'data:text/html,hi' })).toBeNull()
  })

  it('repairs unknown type, status and billing, and a bad price', () => {
    const r = repairResource({ ...resourceFixture('A'), type: 'book', status: 'done', billing: 'weekly', price: 5 })!
    expect(r).toMatchObject({ type: 'other', status: 'using', billing: 'free', price: null, renewsOn: null })
    for (const price of [0, -3, Number.NaN, '12', null]) {
      expect(repairResource({ ...resourceFixture('A'), billing: 'month', price, renewsOn: '2026-10-15' })).toMatchObject({ billing: 'free', price: null, renewsOn: null })
    }
  })

  it('keeps a renewal date only for monthly or yearly billing', () => {
    expect(repairResource({ ...resourceFixture('A'), billing: 'once', price: 9.99, renewsOn: '2026-10-15' })).toMatchObject({ renewsOn: null })
    expect(repairResource({ ...resourceFixture('A'), billing: 'year', price: 99, renewsOn: 'soon' })).toMatchObject({ renewsOn: null })
  })

  it('fills missing text fields: title from the link, company from detection, empty notes', () => {
    const r = repairResource({ id: 'x', url: 'https://huggingface.co/learn/llm-course' }, '2026-10-12')!
    expect(r).toMatchObject({
      title: 'https://huggingface.co/learn/llm-course', company: 'Hugging Face', type: 'other', status: 'using',
      goalId: null, billing: 'free', price: null, renewsOn: null, notes: '', createdAt: '2026-10-12',
    })
    expect(r).not.toHaveProperty('keptFor')
    expect(r).not.toHaveProperty('deletedOn')
  })

  it('repairs a list, and treats anything else as empty', () => {
    expect(repairResources([resourceFixture('A'), { id: 'bad' }]).map((r) => r.id)).toEqual(['A'])
    expect(repairResources(undefined)).toEqual([])
    expect(repairResources({ a: 1 })).toEqual([])
  })
})

const TODAY = '2026-10-12'
const plus = resourceFixture('Coursera Plus', { company: 'Coursera', type: 'membership', billing: 'month', price: 49, renewsOn: '2026-10-15', createdAt: '2026-09-02' })
const infovis = resourceFixture('InfoVis', { company: 'Coursera', goalId: 'D3', notes: 'Week 3 of 5', createdAt: '2026-09-01' })
const llm = resourceFixture('LLM Course', { company: 'Hugging Face' })
const premium = resourceFixture('Premium', { company: 'Dreaming Spanish', type: 'membership', billing: 'month', price: 8, renewsOn: '2026-11-02' })
const skill = resourceFixture('Annual', { company: 'Skillshare', type: 'membership', billing: 'year', price: 99, renewsOn: '2027-01-20' })
const udemy = resourceFixture('Masterclass', { company: 'Udemy', billing: 'once', price: 12.99, status: 'dropped', goalId: 'D3' })

describe('money and labels', () => {
  it('formats pounds', () => {
    expect(money(49)).toBe('£49')
    expect(money(9.99)).toBe('£9.99')
    expect(money(65.25)).toBe('£65.25')
    expect(money(8.25)).toBe('£8.25')
    expect(money(99 / 12)).toBe('£8.25')
  })
  it('says how far away a day is', () => {
    expect([inDays(0), inDays(1), inDays(3)]).toEqual(['today', 'tomorrow', 'in 3 days'])
  })
})

describe('renewals', () => {
  it('steps a renewal forward by its period, clamping to the end of short months', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15')
    const r = { ...plus, renewsOn: '2026-01-31' }
    expect(nextRenewal(r, '2026-02-10')).toBe('2026-02-28')
    expect(nextRenewal(r, '2026-03-01')).toBe('2026-03-31')
    expect(nextRenewal(r, TODAY)).toBe('2026-10-31')
    expect(nextRenewal({ ...skill, renewsOn: '2020-03-01' }, TODAY)).toBe('2027-03-01')
    expect(nextRenewal(plus, TODAY)).toBe('2026-10-15')
    expect(nextRenewal(plus, '2026-10-15')).toBe('2026-10-15')
    expect(nextRenewal(udemy, TODAY)).toBeNull()
    expect(nextRenewal({ ...plus, renewsOn: null }, TODAY)).toBeNull()
  })

  it('reminds 0–3 days ahead for in-use subscriptions, until kept, and again next cycle', () => {
    expect(dueRenewals([plus, premium, skill, udemy], TODAY)).toEqual([{ resource: plus, date: '2026-10-15', days: 3 }])
    expect(dueRenewals([plus], '2026-10-11')).toEqual([])
    expect(dueRenewals([{ ...plus, status: 'dropped' }], TODAY)).toEqual([])
    expect(dueRenewals([{ ...plus, deletedOn: TODAY }], TODAY)).toEqual([])
    const kept = { ...plus, keptFor: '2026-10-15' }
    expect(dueRenewals([kept], TODAY)).toEqual([])
    expect(dueRenewals([kept], '2026-11-13')).toEqual([{ resource: kept, date: '2026-11-15', days: 2 }])
  })

  it('lists renewals in the next six days after today for Upcoming', () => {
    expect(upcomingRenewals([plus, premium], TODAY)).toEqual([{ resource: plus, date: '2026-10-15', days: 3 }])
    expect(upcomingRenewals([plus], '2026-10-15')).toEqual([])
  })

  it('describes the next renewal, red within a week, with the year when it differs', () => {
    expect(renewalText(plus, TODAY)).toEqual({ text: 'Renews Oct 15 · in 3 days', soon: true })
    expect(renewalText(premium, TODAY)).toEqual({ text: 'Renews Nov 2', soon: false })
    expect(renewalText(skill, TODAY)).toEqual({ text: 'Renews Jan 20, 2027', soon: false })
    expect(renewalText(udemy, TODAY)).toBeNull()
  })
})

describe('costs and memberships', () => {
  it('counts monthly cost only for in-use subscriptions', () => {
    expect([plus, premium, skill, udemy, llm].map(monthlyCost)).toEqual([49, 8, 8.25, 0, 0])
    expect(monthlyCost({ ...plus, status: 'later' })).toBe(0)
  })

  it("covers a company's free resources with its in-use membership", () => {
    const rs = [plus, infovis, llm]
    expect(coveringMembership(infovis, rs)).toBe(plus)
    expect(coveringMembership(llm, rs)).toBeNull()
    expect(coveringMembership(plus, rs)).toBeNull()
    expect(coveringMembership(infovis, [{ ...plus, status: 'dropped' }, infovis])).toBeNull()
    expect(coveredBy(plus, rs)).toEqual([infovis])
  })

  it('writes the price column', () => {
    const rs = [plus, infovis, llm, udemy, skill]
    expect([plus, infovis, llm, udemy, skill].map((r) => priceText(r, rs))).toEqual(['£49 / month', 'In Coursera Plus', 'Free', '£12.99 once', '£99 / year'])
  })

  it('writes the money line, hidden when nothing recurs', () => {
    expect(moneyLine([plus, premium, skill, infovis], TODAY)).toEqual({
      total: '£65.25 a month', count: 'on 3 subscriptions', renewal: { text: 'Coursera Plus renews in 3 days', soon: true },
    })
    expect(moneyLine([premium], TODAY)).toEqual({ total: '£8 a month', count: 'on 1 subscription', renewal: { text: 'next: Premium on Nov 2', soon: false } })
    expect(moneyLine([infovis, udemy], TODAY)).toBeNull()
  })
})

describe('resource list', () => {
  const goals = [goalFixture('D3', []), { ...goalFixture('Gone', []), deletedOn: '2026-09-01' }]
  const all = [plus, infovis, llm, premium, skill, udemy, resourceFixture('Orphan', { company: 'Hugging Face', goalId: 'Gone' })]

  it('groups by company, largest first, memberships first, with company subtotals', () => {
    const groups = resourceList(all, goals, { status: 'using', goal: 'all' }, TODAY)
    expect(groups.map((g) => [g.company, g.sub])).toEqual([
      ['Coursera', '2 resources · £49 a month'],
      ['Hugging Face', '2 resources'],
      ['Dreaming Spanish', '1 resource · £8 a month'],
      ['Skillshare', '1 resource · £8.25 a month'],
    ])
    expect(groups[0].rows.map((r) => r.resource.id)).toEqual(['Coursera Plus', 'InfoVis'])
    expect(groups[0].rows[1]).toMatchObject({ goal: { title: 'D3', color: 'var(--color-accent)' }, price: 'In Coursera Plus', paid: false, renewal: null })
    expect(groups[0].rows[0]).toMatchObject({ price: '£49 / month', paid: true, renewal: { text: 'Renews Oct 15 · in 3 days', soon: true } })
    expect(groups[1].rows.find((r) => r.resource.id === 'Orphan')!.goal).toBeNull()
  })

  it('filters by status and goal, and counts per status for the goal filter', () => {
    expect(resourceList(all, goals, { status: 'dropped', goal: 'all' }, TODAY).map((g) => g.company)).toEqual(['Udemy'])
    expect(resourceList(all, goals, { status: 'all', goal: 'D3' }, TODAY).flatMap((g) => g.rows.map((r) => r.resource.id))).toEqual(['InfoVis', 'Masterclass'])
    // "No goal" includes Orphan, whose goal was deleted; Hugging Face has two, so it leads.
    expect(resourceList(all, goals, { status: 'using', goal: 'none' }, TODAY).flatMap((g) => g.rows.map((r) => r.resource.id)))
      .toEqual(['LLM Course', 'Orphan', 'Coursera Plus', 'Premium', 'Annual'])
    expect(statusCounts(all, 'all', goals)).toEqual({ using: 6, later: 0, finished: 0, dropped: 1, all: 7 })
    expect(statusCounts(all, 'D3', goals)).toEqual({ using: 1, later: 0, finished: 0, dropped: 1, all: 2 })
    expect(statusCounts(all, 'none', goals)).toEqual({ using: 5, later: 0, finished: 0, dropped: 0, all: 5 })
    expect(resourceList([{ ...llm, deletedOn: TODAY }], goals, { status: 'all', goal: 'all' }, TODAY)).toEqual([])
  })

  it('offers goal filters for live goals that have resources, plus No goal', () => {
    expect(goalFilterOptions(all, goals)).toEqual([
      { value: 'all', label: 'All goals' }, { value: 'D3', label: 'D3' }, { value: 'none', label: 'No goal' },
    ])
  })

  it("lists a goal's in-use resources, oldest first", () => {
    expect(goalResources(all, 'D3').map((r) => r.id)).toEqual(['InfoVis'])
    expect(goalResources(all, 'Gone')).toEqual([resourceFixture('Orphan', { company: 'Hugging Face', goalId: 'Gone' })])
  })

  it('writes the library kicker', () => {
    expect(libraryKicker(all)).toBe('Library · 7 resources from 5 companies')
    expect(libraryKicker([llm])).toBe('Library · 1 resource from 1 company')
  })
})
