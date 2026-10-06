import { ApiError } from './unwrapApiEnvelope'

// 재시도 기준: 4xx는 다시 보내도 결과가 같으므로 재시도하지 않는다(429는 인프라가 만든 응답이라 예외).
// 5xx, 네트워크 오류(상태 코드 없음), 200이어도 JSON이 아니거나 형식이 맞지 않는 응답은 실패로 보고
// 재시도한다. (백엔드 확인, 추가지침 02 작업 1)
// 재시도 간격은 늘리지 않는다(백오프, 지터 없음). 원래 폴링 간격 그대로다. (추가지침 02, 확정)
export function isRetryableError(e: unknown): boolean {
  if (!(e instanceof ApiError)) return true
  const s = e.status
  if (s === null) return true
  if (s >= 400 && s < 500) return s === 429
  return true
}
