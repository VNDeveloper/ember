import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs tests in jsdom', () => {
    expect(typeof localStorage.setItem).toBe('function')
  })
})
