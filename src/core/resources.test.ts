import { describe, expect, it } from 'vitest'
import { repairResource, repairResources } from './resources'
import { resourceFixture } from './test-fixtures'

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
