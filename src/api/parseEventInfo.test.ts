import { describe, expect, it } from 'vitest'
import { parseEventInfo } from './parseEventInfo'
import { ApiError } from './unwrapApiEnvelope'

const valid = {
  eventId: 1,
  name: 'PoC 쿠폰 발급 이벤트',
  startAt: '2026-09-29T10:00:00+09:00',
  endAt: '2026-10-29T10:00:00+09:00',
  bannerUrl: '',
  returnUrl: '',
}

describe('parseEventInfo', () => {
  it('올바른 응답은 그대로 통과한다(빈 bannerUrl, returnUrl 포함)', () => {
    expect(parseEventInfo(valid)).toEqual(valid)
  })

  it('필드가 빠지거나 타입이 다르면 ApiError', () => {
    expect(() => parseEventInfo({ ...valid, name: undefined })).toThrow(ApiError)
    expect(() => parseEventInfo({ ...valid, eventId: '1' })).toThrow(ApiError)
    expect(() => parseEventInfo({ ...valid, bannerUrl: null })).toThrow(ApiError)
  })

  it('시각이 날짜로 해석되지 않으면 ApiError', () => {
    expect(() => parseEventInfo({ ...valid, startAt: 'soon' })).toThrow(ApiError)
    expect(() => parseEventInfo({ ...valid, endAt: 123 })).toThrow(ApiError)
  })

  it('객체가 아니면 ApiError', () => {
    expect(() => parseEventInfo(null)).toThrow(ApiError)
    expect(() => parseEventInfo([valid])).toThrow(ApiError)
  })
})
