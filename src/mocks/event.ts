import { now } from '../lib/serverTime'

// event 테이블 컬럼 출처는 docs/db/PoC 데이터베이스 정의서.md §4, §7 (CLAUDE.md §7과 일치 확인함).
export type EventInfo = {
  eventId: number // event.event_id (INT UNSIGNED, 시드는 1)
  name: string // event.name
  startAt: string // event.start_at. 항상 KST(+09:00)로 해석/표기
  endAt: string // event.end_at. 항상 KST(+09:00)로 해석/표기
  bannerUrl: string // event.banner_image_path. DB 시드 값은 빈 문자열
  returnUrl: string // event.endpoint_url (테넌트 복귀 주소). DB 시드 값은 빈 문자열
}

// epochMs 시점을 KST(+09:00) 벽시계 기준 ISO 문자열로 표기한다. 브라우저 로컬 시간대에 의존하지 않는다.
function toKstIsoString(epochMs: number): string {
  const kst = new Date(epochMs + 9 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = kst.getUTCFullYear()
  const MM = pad(kst.getUTCMonth() + 1)
  const dd = pad(kst.getUTCDate())
  const hh = pad(kst.getUTCHours())
  const mm = pad(kst.getUTCMinutes())
  const ss = pad(kst.getUTCSeconds())
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}+09:00`
}

function getStartsInSeconds(): number {
  const raw = new URLSearchParams(window.location.search).get('startsIn')
  const n = raw !== null ? Number(raw) : NaN
  return Number.isFinite(n) ? n : 15
}

// returnUrl이 빈 문자열일 때의 동작은 CLAUDE.md §4에 정의되어 있다(모달 안에 안내 문구).
// getEventInfo는 이제 실제 /info를 호출한다. 이 더미는 `?startsIn=<초>`가 있을 때만 쓰는 개발용이다
// (카운트다운 확인용, 실제 이벤트는 시작 시각이 이미 지났을 수 있음). (CLAUDE.md §5)
// DB 시드 값은 빈 문자열이라 기본값도 빈 문자열로 둔다. 04→모달→복귀 흐름 전체를 눈으로 확인하려면
// 개발 중 `?returnUrl=<url>` 쿼리로 값을 채워 테스트한다.
function getReturnUrl(): string {
  const raw = new URLSearchParams(window.location.search).get('returnUrl')
  return raw ?? ''
}

// 배너는 DB 시드가 빈 문자열이지만, 화면에서 배너 렌더링 자체를 눈으로 확인할 수 있도록
// 기본값은 public/의 더미 이미지로 둔다. `?banner=`를 빈 값으로 주면 빈 문자열 케이스를 재현한다.
function getBannerUrl(): string {
  const params = new URLSearchParams(window.location.search)
  if (params.has('banner')) return params.get('banner') ?? ''
  return '/banner-dummy.svg'
}

export function buildDummyEventInfo(eventId: number): EventInfo {
  const startMs = now() + getStartsInSeconds() * 1000
  const startAt = toKstIsoString(startMs)
  const endAt = toKstIsoString(startMs + 30 * 24 * 60 * 60 * 1000)
  return {
    eventId,
    name: 'PoC 이벤트',
    startAt,
    endAt,
    bannerUrl: getBannerUrl(),
    returnUrl: getReturnUrl(),
  }
}
