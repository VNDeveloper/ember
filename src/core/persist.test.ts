import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, loadData, saveData } from './persist'
import { dataFixture, taskFixture } from './test-fixtures'

describe('persistence', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips data', () => {
    const data = dataFixture({ tasks: [taskFixture('Water the plants')] })
    saveData(data)
    expect(loadData()).toEqual(data)
  })

  it('returns null when nothing is saved', () => {
    expect(loadData()).toBeNull()
  })

  it('backs up unreadable data before giving up', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadData()).toBeNull()
    const backups = Object.keys(localStorage).filter((k) => k.startsWith(`${STORAGE_KEY}:corrupt:`))
    expect(backups).toHaveLength(1)
    expect(localStorage.getItem(backups[0])).toBe('{not json')
  })

  it('backs up data from an unknown version', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, data: dataFixture() }))
    expect(loadData()).toBeNull()
    expect(Object.keys(localStorage).some((k) => k.startsWith(`${STORAGE_KEY}:corrupt:`))).toBe(true)
  })

  it('fills in settings added after the data was saved', () => {
    const data = dataFixture()
    const { wallWeeks: _dropped, ...oldSettings } = data.settings
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: { ...data, settings: oldSettings } }))
    expect(loadData()?.settings.wallWeeks).toBe(12)
  })

  it('keeps running when storage refuses to save', () => {
    const full = { setItem: vi.fn(() => { throw new Error('QuotaExceededError') }) } as unknown as Storage
    expect(() => saveData(dataFixture(), full)).not.toThrow()
  })
})
