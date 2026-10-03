import { describe, expect, it } from 'vitest'
import { embedUrl, ytId } from './youtube'

describe('ytId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=jfKfPfyJRdk', 'jfKfPfyJRdk'],
    ['https://youtube.com/watch?feature=share&v=jfKfPfyJRdk&t=30', 'jfKfPfyJRdk'],
    ['https://youtu.be/jfKfPfyJRdk?si=abc', 'jfKfPfyJRdk'],
    ['https://www.youtube.com/embed/jfKfPfyJRdk', 'jfKfPfyJRdk'],
    ['https://www.youtube.com/shorts/jfKfPfyJRdk', 'jfKfPfyJRdk'],
    ['https://www.youtube.com/live/jfKfPfyJRdk', 'jfKfPfyJRdk'],
    ['  jfKfPfyJRdk  ', 'jfKfPfyJRdk'],
  ])('parses %s', (input, id) => {
    expect(ytId(input)).toBe(id)
  })

  it.each(['', 'hello', 'https://vimeo.com/123456', 'https://youtube.com/watch?v=short'])('rejects %s', (input) => {
    expect(ytId(input)).toBeNull()
  })
})

describe('embedUrl', () => {
  it('builds the nocookie loop URL', () => {
    expect(embedUrl('jfKfPfyJRdk', true)).toBe(
      'https://www.youtube-nocookie.com/embed/jfKfPfyJRdk?autoplay=1&mute=1&loop=1&playlist=jfKfPfyJRdk&controls=0&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1',
    )
    expect(embedUrl('jfKfPfyJRdk', false)).toContain('mute=0')
  })
})
