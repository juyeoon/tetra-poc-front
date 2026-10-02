// API 호출은 전부 이 모듈에만 둔다. 화면 코드는 fetch/axios를 직접 쓰지 않는다. (CLAUDE.md §5)
// 2단계: 모든 호출이 실제 API로 바뀌었다(getEventInfo는 개발용 ?startsIn= 때만 더미). 화면 코드는 바꾸지 않았다.
import { now } from '../lib/serverTime'
import { buildDummyEventInfo, type EventInfo } from '../mocks/event'
import { parseCursorResponse } from './parseCursorResponse'
import { parseEventInfo } from './parseEventInfo'
import { ApiError, unwrapApiEnvelope } from './unwrapApiEnvelope'

export type { EventInfo }

export type Coupon = {
  couponId: number
  name: string
  description: string
}

export type ClaimResult = 'SUCCESS' | 'FAILED_SOLDOUT'


// 같은 호스트의 상대 경로만 쓴다. 절대 URL/호스트 하드코딩 금지. (CLAUDE.md §5 2단계 규칙)
// 세션은 서버가 내려주는 HttpOnly 쿠키이므로 JS는 세션 id를 읽지도, 헤더에 싣지도 않는다. same-origin이면
// 브라우저가 쿠키를 자동으로 보내지만 명시적으로 밝혀 둔다. user_id도 절대 요청 본문에 넣지 않는다(서버가 세션에서 꺼냄).
// fetch는 HTTP 오류(res.ok가 false)에서 예외를 던지지 않으므로 직접 확인해 실패로 처리한다. (CLAUDE.md §5)
// 5개 API 모두 { success, data } / { success:false, error:{code,message} } 봉투다. 에러 응답(4xx/5xx)도
// 본문이 봉투이므로 읽어서 error.code를 ApiError에 싣는다. 본문을 읽을 수 없으면 상태 코드만 싣는다.
async function readEnvelope(res: Response, label: string): Promise<unknown> {
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new ApiError(`요청 실패: ${label} -> ${res.status}`, null, res.status)
  }
  if (!res.ok) {
    try {
      unwrapApiEnvelope(body, res.status)
    } catch (e) {
      if (e instanceof ApiError && e.code !== null) throw e
    }
    throw new ApiError(`요청 실패: ${label} -> ${res.status}`, null, res.status)
  }
  return unwrapApiEnvelope(body, res.status)
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
  })
  return readEnvelope(res, `${init?.method ?? 'GET'} ${path}`)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// 번호표 응답 data는 { ticketNumber: number }. 화면 코드가 쓰는 { ticket }으로 옮겨 담는다.
// TODO(미정): 화면 코드의 이름을 ticketNumber로 맞출지
export async function requestTicket(eventId: number): Promise<{ ticket: number }> {
  const data = await request(`/api/issuance/events/${eventId}/ticket`, { method: 'POST' })
  if (!isRecord(data) || typeof data.ticketNumber !== 'number' || !Number.isFinite(data.ticketNumber)) {
    throw new ApiError('번호표 응답 형식 오류')
  }
  return { ticket: data.ticketNumber }
}

// --- 커서 테스트용 목(mock) 모드 (추가지침 01 §4) ---
// ?cursorRegress=<n> 또는 ?cursorFail=<n>|always가 있을 때만 켜진다. 평소(둘 다 없음)에는
// 바로 아래의 실제 fetch 경로를 탄다. ?cursorPerSec=<n>은 이 목 모드 전용으로, 시간에 비례해
// 올라가는 가짜 커서를 만드는 데만 쓴다(기본 초당 20).
// TODO(미정): CLAUDE.md §5의 1단계용 ?ticket=은 2단계에서 실제 번호표 API로 교체하며 뺐다.
// 이 문서가 ?ticket=/?cursorPerSec=가 함께 있다고 전제한 부분과 어긋나, ?cursorPerSec=만
// 커서 테스트 전용으로 되살렸다.
function isCursorMockActive(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has('cursorRegress') || params.has('cursorFail')
}

function getCursorMockPerSec(): number {
  const raw = new URLSearchParams(window.location.search).get('cursorPerSec')
  const n = raw !== null ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : 20
}

let cursorMockStartTime: number | null = null
let cursorMockCallCount = 0

// 목 모드의 응답 본문을 만든다. 실패를 흉내 낼 때도 일부러 형식이 잘못된 값을 돌려줘서
// parseCursorResponse가 실제로 걸러내는 경로를 그대로 타게 한다.
function buildMockCursorBody(): unknown {
  const params = new URLSearchParams(window.location.search)
  cursorMockCallCount += 1

  const failParam = params.get('cursorFail')
  const failsAlways = failParam === 'always'
  const failEveryN = failParam !== null && !failsAlways ? Number(failParam) : NaN
  if (failsAlways || (Number.isFinite(failEveryN) && failEveryN > 0 && cursorMockCallCount % failEveryN === 0)) {
    return { cursor: 'not-a-number' }
  }

  const perSec = getCursorMockPerSec()
  if (cursorMockStartTime === null) {
    cursorMockStartTime = now()
  }
  const elapsedSec = (now() - cursorMockStartTime) / 1000
  const trueCursor = Math.floor(elapsedSec * perSec)

  const regressParam = params.get('cursorRegress')
  const regressEveryN = regressParam !== null ? Number(regressParam) : NaN
  if (Number.isFinite(regressEveryN) && regressEveryN > 0 && cursorMockCallCount % regressEveryN === 0) {
    // cursorPerSec 1.5초분만큼 역행시킨다 (추가지침 01 §4)
    return { cursor: Math.max(0, trueCursor - Math.round(perSec * 1.5)) }
  }

  return { cursor: trueCursor }
}

// 서빙 커서. CloudFront 엣지에서 캐시되므로(추가지침 01) 캐시 무효화 쿼리, fetch의 cache 옵션,
// 커스텀 헤더, credentials 옵션 변경을 하지 않는다 — 같은 호스트 상대 경로에 대한 기본 fetch 그대로 둔다.
// 이 경로는 인증이 없다(2026-10-01 확인, CDN 캐시 대상이라 세션 쿠키도 필요 없음).
// 4xx/5xx는 실제 상태 코드로 오므로(index.html로 안 바뀜) res.ok로 실패를 판단한다.
// 응답은 { success, data: { cursor } } 공통 봉투 형식이라(2026-10-01 변경) unwrapApiEnvelope로
// data를 꺼낸 뒤, parseCursorResponse로 그 안의 { cursor: number } 모양까지 검증한다.
export async function getQueueCursor(eventId: number): Promise<{ cursor: number }> {
  if (isCursorMockActive()) {
    return parseCursorResponse(buildMockCursorBody())
  }

  const res = await fetch(`/api/issuance/events/${eventId}/queue/cursor`)
  return parseCursorResponse(await readEnvelope(res, 'GET queue/cursor'))
}

// 이벤트 정보. GET /api/issuance/events/{eventId}/info (인증과 쿠키 불필요).
// CDN에서 최대 60초 캐시되므로(s-maxage=60) 커서처럼 캐시 무효화 쿼리, fetch의 cache 옵션,
// 커스텀 헤더, credentials 옵션 변경을 하지 않는다 — 같은 호스트 상대 경로에 대한 기본 fetch 그대로 둔다.
// 개발용: `?startsIn=<초>`가 있으면 더미를 돌려준다. 로컬 DB 시드의 시작 시각은 이미 지나서,
// 실제 응답으로는 02에서 카운트다운을 볼 수 없기 때문이다.
export async function getEventInfo(eventId: number): Promise<EventInfo> {
  if (new URLSearchParams(window.location.search).has('startsIn')) {
    return buildDummyEventInfo(eventId)
  }
  const res = await fetch(`/api/issuance/events/${eventId}/info`)
  return parseEventInfo(await readEnvelope(res, 'GET info'))
}

// 쿠폰 목록 응답 data는 { coupons: [...] }. 배열을 꺼내 돌려준다.
// 응답 항목에는 remaining(Redis 실시간 재고)도 오지만 화면에 보여 주지 않기로 확정해서 타입에 두지 않는다.
export async function getCoupons(eventId: number): Promise<Coupon[]> {
  const data = await request(`/api/issuance/events/${eventId}/coupons`)
  if (!isRecord(data) || !Array.isArray(data.coupons)) {
    throw new ApiError('쿠폰 목록 응답 형식 오류')
  }
  return data.coupons as Coupon[]
}

// claim 응답 data는 { result: 'SUCCESS' | 'SOLD_OUT', coupons: [...] }. 품절 값은 서버가 SOLD_OUT으로 준다.
// 화면 코드는 DB issuance_history.result 값인 FAILED_SOLDOUT을 쓰므로 여기서 옮겨 담는다.
// 응답의 coupons는 쓰지 않는다. 서버 측 재검증 로직은 별도 담당.
// TODO(미정): 화면 코드의 값 이름을 SOLD_OUT으로 맞출지
export async function claimCoupons(eventId: number): Promise<{ result: ClaimResult }> {
  const data = await request(`/api/issuance/events/${eventId}/coupons/claim`, { method: 'POST' })
  if (!isRecord(data)) throw new ApiError('쿠폰 발급 응답 형식 오류')
  if (data.result === 'SUCCESS') return { result: 'SUCCESS' }
  if (data.result === 'SOLD_OUT') return { result: 'FAILED_SOLDOUT' }
  throw new ApiError('쿠폰 발급 응답 형식 오류')
}
