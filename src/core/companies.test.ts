import { describe, expect, it } from 'vitest'
import { companySuggestions, detect, findDuplicate, hostOf, linkKey, normaliseUrl, shortLink } from './companies'
import { resourceFixture } from './test-fixtures'

describe('normaliseUrl', () => {
  it.each([
    ['https://www.HuggingFace.co/learn/llm-course/', 'https://huggingface.co/learn/llm-course'],
    ['  coursera.org/learn/machine-learning ', 'https://coursera.org/learn/machine-learning'],
    ['https://example.com/a?utm_source=x&id=3#top', 'https://example.com/a?id=3'],
    ['http://example.com', 'http://example.com'],
    ['https://example.com:8080/x', 'https://example.com:8080/x'],
  ])('%s → %s', (input, out) => {
    expect(normaliseUrl(input)).toBe(out)
  })

  it.each(['', 'hello world', 'javascript:alert(1)', 'data:text/html,hi', 'mailto:a@b.co', 'ftp://example.com', 'https://localhost'])(
    'rejects %j',
    (input) => { expect(normaliseUrl(input)).toBeNull() },
  )
})

describe('hostOf and shortLink', () => {
  it('reads the host without www, and a short link without the scheme', () => {
    expect(hostOf('https://www.youtube.com/watch?v=abc')).toBe('youtube.com')
    expect(hostOf('not a url')).toBe('')
    expect(shortLink('https://huggingface.co/learn/llm-course')).toBe('huggingface.co/learn/llm-course')
    expect(shortLink('https://example.com')).toBe('example.com')
  })
})

describe('detect', () => {
  it.each([
    ['https://huggingface.co/learn/llm-course', 'Hugging Face', 'course', 'Llm course'],
    ['https://huggingface.co/docs/transformers', 'Hugging Face', 'docs', 'Transformers'],
    ['https://huggingface.co/spaces/org/demo', 'Hugging Face', 'tool', 'Demo'],
    ['https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2', 'Hugging Face', 'model', 'all-MiniLM-L6-v2'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ', 'YouTube', 'video', ''],
    ['https://youtu.be/dQw4w9WgXcQ', 'YouTube', 'video', ''],
    ['https://coursera.org/learn/machine-learning', 'Coursera', 'course', 'Machine learning'],
    ['https://observablehq.com/@d3/gallery', 'Observable', 'docs', 'Gallery'],
    ['https://someone.substack.com/p/why-charts-lie', 'Substack', 'article', 'Why charts lie'],
    ['https://docs.python.org/3/tutorial', 'docs.python.org', 'docs', 'Tutorial'],
    ['https://3blue1brown.com/lessons/neural-networks', '3blue1brown.com', 'article', 'Neural networks'],
    ['https://medium.com/@me/learning-d3-8f3a2b1c9d0e', 'Medium', 'article', 'Learning d3'],
    ['https://example.com/posts/12345', 'example.com', 'article', 'Posts'],
    ['https://example.com', 'example.com', 'article', ''],
  ])('%s', (url, company, type, title) => {
    expect(detect(url, [])).toEqual({ company, type, title })
  })

  it("uses the user's own spelling for a host they've saved before", () => {
    const mine = resourceFixture('Old', { url: 'https://3blue1brown.com/lessons/one', company: '3Blue1Brown' })
    expect(detect('https://3blue1brown.com/lessons/two', [mine]).company).toBe('3Blue1Brown')
    const gone = { ...mine, deletedOn: '2026-09-01' }
    expect(detect('https://3blue1brown.com/lessons/two', [gone]).company).toBe('3blue1brown.com')
  })
})

describe('duplicates', () => {
  it('matches the same YouTube video across link styles, and other links after normalising', () => {
    expect(linkKey('https://youtu.be/dQw4w9WgXcQ')).toBe(linkKey('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30'))
    expect(linkKey('https://example.com/a?v=dQw4w9WgXcQ')).not.toBe(linkKey('https://youtu.be/dQw4w9WgXcQ'))
    const saved = resourceFixture('Joins', { url: 'https://youtube.com/watch?v=dQw4w9WgXcQ' })
    const site = resourceFixture('Site', { url: 'https://example.com/a' })
    expect(findDuplicate('https://youtu.be/dQw4w9WgXcQ', [saved, site])?.id).toBe('Joins')
    expect(findDuplicate('https://www.example.com/a/?utm_source=x', [saved, site])?.id).toBe('Site')
    expect(findDuplicate('https://example.com/b', [saved, site])).toBeNull()
    expect(findDuplicate('https://example.com/a', [{ ...site, deletedOn: '2026-09-01' }])).toBeNull()
  })
})

describe('companySuggestions', () => {
  it('lists live companies containing the text, most used first, never the exact text', () => {
    const rs = [
      resourceFixture('A', { company: 'YouTube' }), resourceFixture('B', { company: 'YouTube' }),
      resourceFixture('C', { company: 'Coursera' }), resourceFixture('D', { company: 'Udemy', deletedOn: '2026-09-01' }),
    ]
    expect(companySuggestions(rs, '')).toEqual(['YouTube', 'Coursera'])
    expect(companySuggestions(rs, 'ou')).toEqual(['YouTube', 'Coursera'])
    expect(companySuggestions(rs, 'cour')).toEqual(['Coursera'])
    expect(companySuggestions(rs, 'coursera')).toEqual([])
    expect(companySuggestions(rs, 'udemy')).toEqual([])
  })
})
