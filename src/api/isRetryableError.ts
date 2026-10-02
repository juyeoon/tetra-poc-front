import { ApiError } from './unwrapApiEnvelope'

// 재시도 기준 (백엔드 확인): 4xx는 다시 보내도 결과가 같으므로 재시도하지 않는다.
// 5xx, 네트워크 오류(상태 코드 없음), 인프라가 만든 429/502/503/504만 재시도한다.
// 2xx인데 봉투가 아닌 응답은 설정 오류라 재시도하지 않는다.
// TODO(미정): 재시도 간격을 늘리는 방식(지수 백오프, 지터)을 쓸지. 백엔드는 점점 늘리는 방식을 권장.
export function isRetryableError(e: unknown): boolean {
  if (!(e instanceof ApiError)) return true
  const s = e.status
  if (s === null) return true
  return s === 429 || s >= 500
}
