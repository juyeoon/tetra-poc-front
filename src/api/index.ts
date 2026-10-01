// API 호출은 전부 이 모듈에만 둔다. 화면 코드는 fetch/axios를 직접 쓰지 않는다. (CLAUDE.md §5)
// 2단계: getEventInfo를 뺀 나머지는 실제 호출로 바뀌었다. 화면 코드는 바꾸지 않았다.
import { now } from '../lib/serverTime'
import { buildDummyEventInfo, type EventInfo } from '../mocks/event'
import { parseCursorResponse } from './parseCursorResponse'

export type { EventInfo }

export type Coupon = {
  couponId: number
  name: string
  description: string
  remaining: number
}

export type ClaimResult = 'SUCCESS' | 'FAILED_SOLDOUT'

// 이벤트 정보(이벤트명/시작시각/배너/복귀주소)는 API가 없다. PoC 전용 더미로 계속 유지한다. (CLAUDE.md §5)
export async function getEventInfo(eventId: number): Promise<EventInfo> {
  return buildDummyEventInfo(eventId)
}

// 같은 호스트의 상대 경로만 쓴다. 절대 URL/호스트 하드코딩 금지. (CLAUDE.md §5 2단계 규칙)
// 세션은 서버가 내려주는 HttpOnly 쿠키이므로 JS는 세션 id를 읽지도, 헤더에 싣지도 않는다. same-origin이면
// 브라우저가 쿠키를 자동으로 보내지만 명시적으로 밝혀 둔다. user_id도 절대 요청 본문에 넣지 않는다(서버가 세션에서 꺼냄).
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
  })
  // fetch는 HTTP 오류(res.ok가 false)에서 예외를 던지지 않으므로 직접 확인해 실패로 처리한다. (CLAUDE.md §5)
  if (!res.ok) {
    throw new Error(`요청 실패: ${init?.method ?? 'GET'} ${path} -> ${res.status}`)
  }
  return (await res.json()) as T
}

// 응답 모양은 미정이며 임시로 { ticket: number }로 받는다 (CLAUDE.md §5). 에러 코드도 미정(§10).
export async function requestTicket(eventId: number): Promise<{ ticket: number }> {
  return request(`/api/issuance/events/${eventId}/ticket`, { method: 'POST' })
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
// 쿠키는 브라우저 기본 동작으로 함께 나가지만 이 경로에서는 CloudFront가 origin에 전달하지 않는다.
// res.ok만으로는 CloudFront 설정 오류(index.html이 200으로 돌아오는 경우)를 못 걸러서
// parseCursorResponse로 본문 모양까지 검증한다. 올바른 { cursor: number }가 아니면 전부 reject한다.
export async function getQueueCursor(eventId: number): Promise<{ cursor: number }> {
  if (isCursorMockActive()) {
    return parseCursorResponse(buildMockCursorBody())
  }

  const res = await fetch(`/api/issuance/events/${eventId}/queue/cursor`)
  if (!res.ok) {
    throw new Error(`요청 실패: GET queue/cursor -> ${res.status}`)
  }
  const body: unknown = await res.json()
  return parseCursorResponse(body)
}

// 응답 모양은 미정이며 임시로 이 필드 구성으로 받는다. description이 실제 응답에 포함되는지도 미정(§10).
export async function getCoupons(eventId: number): Promise<Coupon[]> {
  return request(`/api/issuance/events/${eventId}/coupons`)
}

// 응답 모양은 미정이며 임시로 { result }로 받는다 (CLAUDE.md §5). 서버 측 재검증 로직은 별도 담당.
export async function claimCoupons(eventId: number): Promise<{ result: ClaimResult }> {
  return request(`/api/issuance/events/${eventId}/coupons/claim`, { method: 'POST' })
}
