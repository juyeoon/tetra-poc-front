// 모든 API 응답은 공통 봉투 형식이다 (백엔드 확인, 5개 API 모두 처음부터 동일).
//   성공: { success: true, data: {...} }
//   에러: { success: false, error: { code, message } } (HTTP 상태 코드는 4xx/5xx)
// 봉투가 아닌 응답은 설정 오류 같은 비정상 응답이므로 통과시키지 않고 예외로 처리한다.
// TODO(미정): error.code(SESSION_NOT_FOUND, EVENT_NOT_STARTED, ALREADY_CLAIMED, TICKET_REQUIRED 등)별 화면 동작

export class ApiError extends Error {
  readonly code: string | null
  readonly status: number | null

  constructor(message: string, code: string | null = null, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function unwrapApiEnvelope(body: unknown, status: number | null = null): unknown {
  if (!isRecord(body) || typeof body.success !== 'boolean') {
    throw new ApiError('API 응답이 봉투 형식이 아님', null, status)
  }
  if (body.success === false) {
    const err = isRecord(body.error) ? body.error : {}
    const code = typeof err.code === 'string' ? err.code : null
    const message = typeof err.message === 'string' ? err.message : 'API 응답 success=false'
    throw new ApiError(message, code, status)
  }
  return body.data
}
