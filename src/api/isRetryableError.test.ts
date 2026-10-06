import { describe, expect, it } from 'vitest'
import { isRetryableError } from './isRetryableError'
import { ApiError } from './unwrapApiEnvelope'

describe('isRetryableError', () => {
  it('4xx는 재시도하지 않는다', () => {
    for (const s of [400, 401, 403, 404, 405, 409]) {
      expect(isRetryableError(new ApiError('x', null, s))).toBe(false)
    }
  })

  it('429와 5xx는 재시도한다', () => {
    for (const s of [429, 500, 502, 503, 504]) {
      expect(isRetryableError(new ApiError('x', null, s))).toBe(true)
    }
  })

  it('네트워크 오류 등 상태 코드가 없으면 재시도한다', () => {
    expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isRetryableError(new ApiError('x'))).toBe(true)
  })

  it('2xx인데 JSON이 아니거나 형식이 맞지 않는 응답은 실패로 보고 재시도한다', () => {
    expect(isRetryableError(new ApiError('x', null, 200))).toBe(true)
  })
})
