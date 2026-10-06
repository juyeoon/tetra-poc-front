import { describe, expect, it } from 'vitest'
import { parseRetryAfter } from './retryAfter'

describe('parseRetryAfter', () => {
  it('초 단위 정수는 ms로 바꾼다', () => {
    expect(parseRetryAfter('3', 0)).toBe(3000)
    expect(parseRetryAfter('0', 0)).toBe(0)
  })

  it('HTTP 날짜는 지금까지의 차이를 돌려준다(과거면 0)', () => {
    const base = Date.parse('Wed, 21 Oct 2026 07:28:00 GMT')
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:05 GMT', base)).toBe(5000)
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:27:00 GMT', base)).toBe(0)
  })

  it('없거나 해석할 수 없으면 null', () => {
    expect(parseRetryAfter(null, 0)).toBeNull()
    expect(parseRetryAfter('', 0)).toBeNull()
    expect(parseRetryAfter('soon', 0)).toBeNull()
  })
})
