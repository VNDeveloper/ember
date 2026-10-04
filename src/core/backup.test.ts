import { describe, expect, it } from 'vitest'
import { backupFileName, lastBackup, makeBackup, readBackup, rememberBackup } from './backup'
import { dataFixture, goalFixture, taskFixture } from './test-fixtures'

const NOW = new Date(2026, 8, 23, 10, 0).getTime()

describe('backup files', () => {
  it('round-trips the data with an export time', () => {
    const data = dataFixture({ goals: [goalFixture('D3', [])], tasks: [taskFixture('Review PR')] })
    const r = readBackup(makeBackup(data, NOW))
    expect(r).toEqual({ ok: true, data, exportedAt: new Date(NOW).toISOString() })
  })

  it('tags the file as an Ember backup', () => {
    expect(JSON.parse(makeBackup(dataFixture(), NOW))).toMatchObject({ app: 'ember', version: 1 })
  })

  it('rejects anything that is not a readable Ember backup', () => {
    const data = dataFixture()
    expect(readBackup('not json')).toEqual({ ok: false })
    expect(readBackup(JSON.stringify({ version: 1, data }))).toEqual({ ok: false })
    expect(readBackup(JSON.stringify({ app: 'ember', version: 99, data }))).toEqual({ ok: false })
    expect(readBackup(JSON.stringify({ app: 'ember', version: 1, data: { goals: 'x' } }))).toEqual({ ok: false })
  })

  it('names the file by date', () => {
    expect(backupFileName('2026-10-04')).toBe('ember-backup-2026-10-04.json')
  })
})

describe('last backup date', () => {
  it('is remembered separately from the data', () => {
    localStorage.clear()
    expect(lastBackup()).toBeNull()
    rememberBackup('2026-10-02')
    expect(lastBackup()).toBe('2026-10-02')
  })

  it('survives storage that throws', () => {
    const denied = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } } as unknown as Storage
    expect(lastBackup(denied)).toBeNull()
    expect(() => rememberBackup('2026-10-02', denied)).not.toThrow()
  })
})
