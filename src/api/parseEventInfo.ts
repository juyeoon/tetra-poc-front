import type { EventInfo } from '../mocks/event'
import { ApiError } from './unwrapApiEnvelope'

function isValidTime(v: unknown): v is string {
  return typeof v === 'string' && Number.isFinite(new Date(v).getTime())
}

// 이벤트 정보 응답 data의 모양을 검증한다. 시각은 +09:00이 붙은 ISO 문자열로 온다.
// bannerUrl과 returnUrl은 빈 문자열일 수 있고 나머지는 항상 채워져 온다. (백엔드 확인)
export function parseEventInfo(data: unknown): EventInfo {
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const d = data as Record<string, unknown>
    if (
      typeof d.eventId === 'number' &&
      Number.isFinite(d.eventId) &&
      typeof d.name === 'string' &&
      isValidTime(d.startAt) &&
      isValidTime(d.endAt) &&
      typeof d.bannerUrl === 'string' &&
      typeof d.returnUrl === 'string'
    ) {
      return {
        eventId: d.eventId,
        name: d.name,
        startAt: d.startAt,
        endAt: d.endAt,
        bannerUrl: d.bannerUrl,
        returnUrl: d.returnUrl,
      }
    }
  }
  throw new ApiError('이벤트 정보 응답 형식 오류')
}
