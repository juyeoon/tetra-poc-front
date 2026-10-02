import { describe, expect, it } from 'vitest'
import { ApiError, unwrapApiEnvelope } from './unwrapApiEnvelope'

describe('unwrapApiEnvelope', () => {
  it('success:true면 data를 꺼낸다', () => {
    expect(unwrapApiEnvelope({ success: true, data: { cursor: 42 } })).toEqual({ cursor: 42 })
  })

  it('success:false면 error.code와 message를 담은 ApiError', () => {
    try {
      unwrapApiEnvelope({ success: false, error: { code: 'SESSION_NOT_FOUND', message: '세션 없음' } }, 401)
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as ApiError).code).toBe('SESSION_NOT_FOUND')
      expect((e as ApiError).message).toBe('세션 없음')
      expect((e as ApiError).status).toBe(401)
    }
  })

  it('success:false인데 error가 없어도 ApiError(code는 null)', () => {
    try {
      unwrapApiEnvelope({ success: false })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as ApiError).code).toBeNull()
    }
  })

  it('봉투 모양이 아니면 예외', () => {
    expect(() => unwrapApiEnvelope({ ticket: 5 })).toThrow(ApiError)
    expect(() => unwrapApiEnvelope({ success: 'true', data: 1 })).toThrow(ApiError)
    expect(() => unwrapApiEnvelope(null)).toThrow(ApiError)
    expect(() => unwrapApiEnvelope([1, 2, 3])).toThrow(ApiError)
    expect(() => unwrapApiEnvelope('html')).toThrow(ApiError)
  })
})
