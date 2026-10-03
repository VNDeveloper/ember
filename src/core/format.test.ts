import { describe, expect, it } from 'vitest'
import { clock, fmtInt, fmtM, hash7, hashStr, pad2, plural } from './format'

describe('format', () => {
  it('pads to two digits', () => {
    expect(pad2(2)).toBe('02')
    expect(pad2(12)).toBe('12')
  })

  it('formats minutes like the prototype', () => {
    expect(fmtM(0)).toBe('0m')
    expect(fmtM(25)).toBe('25m')
    expect(fmtM(60)).toBe('1h')
    expect(fmtM(75)).toBe('1h 15m')
    expect(fmtM(250)).toBe('4h 10m')
  })

  it('formats integers with en-US grouping', () => {
    expect(fmtInt(1234)).toBe('1,234')
  })

  it('formats a countdown as MM:SS, rounding seconds up and clamping at zero', () => {
    expect(clock(1500)).toBe('25:00')
    expect(clock(3000)).toBe('50:00')
    expect(clock(59.2)).toBe('01:00')
    expect(clock(-3)).toBe('00:00')
  })

  it('hashes strings like the prototype hsh()', () => {
    expect(hashStr('abc')).toBe(304891)
    expect(hash7('abc')).toBe('0004a6f')
  })

  it('pluralises', () => {
    expect(plural(1, 'session')).toBe('1 session')
    expect(plural(2, 'session')).toBe('2 sessions')
    expect(plural(0, 'task')).toBe('0 tasks')
  })
})
