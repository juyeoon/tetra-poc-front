import { ApiError } from '../api/unwrapApiEnvelope'

// 에러 상황과 화면을 고르는 곳. 상태 코드 → 상황 매핑은 이 파일에만 둔다. (추가지침 02 작업 3)
// 판단 순서: (1) 백엔드가 JSON으로 준 error.code(4xx 등 백엔드가 처리한 에러) (2) HTTP 상태 코드.
// 429/502/503/504는 CloudFront나 ALB가 만든 응답이라 본문 code가 없고 상태 코드로만 판단한다.
// 화면 문구는 화면설계서에 없어 팀이 정했다. (CLAUDE.md §8, 확정)

export type ErrorSituation =
  | 'network' // 네트워크 예외, 502, 504, 200인데 JSON이 아니거나 형식이 맞지 않음
  | 'busy' // 503
  | 'rateLimit' // 429
  | 'sessionExpired' // 401
  | 'forbidden' // 403
  | 'notStarted' // EVENT_NOT_STARTED
  | 'ended' // EVENT_ENDED
  | 'alreadyClaimed' // ALREADY_CLAIMED
  | 'ticketRequired' // TICKET_REQUIRED
  | 'notFound' // EVENT_NOT_FOUND, NOT_FOUND
  | 'generic' // 위에 해당하지 않는 4xx, 5xx

// retry: 다시 시도 버튼. auto: Retry-After만큼 기다린 뒤 자동 재시도. back: 테넌트 페이지로 돌아가기. none: 버튼 없음
export type ErrorAction = 'retry' | 'auto' | 'back' | 'none'

export type ErrorNoticeContent = {
  situation: ErrorSituation
  message: string
  action: ErrorAction
  retryAfterMs: number | null
}

// 본문 error.code로 상황을 세분하는 자리. 상태 코드보다 먼저 본다.
const SITUATION_BY_CODE: Record<string, ErrorSituation> = {
  SESSION_NOT_FOUND: 'sessionExpired',
  SESSION_EVENT_MISMATCH: 'forbidden',
  EVENT_NOT_STARTED: 'notStarted',
  EVENT_ENDED: 'ended',
  ALREADY_CLAIMED: 'alreadyClaimed',
  TICKET_REQUIRED: 'ticketRequired',
  EVENT_NOT_FOUND: 'notFound',
  NOT_FOUND: 'notFound',
}

export function classifyError(e: unknown): ErrorSituation {
  if (!(e instanceof ApiError)) return 'network'
  if (e.code !== null && Object.prototype.hasOwnProperty.call(SITUATION_BY_CODE, e.code)) {
    return SITUATION_BY_CODE[e.code]
  }
  const s = e.status
  if (s === null) return 'network'
  if (s === 401) return 'sessionExpired'
  if (s === 403) return 'forbidden'
  if (s === 429) return 'rateLimit'
  if (s === 503) return 'busy'
  if (s === 502 || s === 504) return 'network'
  if (s >= 200 && s < 300) return 'network'
  return 'generic'
}

// ALREADY_CLAIMED는 이전 결과가 품절이었을 수도 있어서 성공처럼 보이지 않게 중립 문구를 쓴다.
// 시작 전(notStarted)은 버튼 없이 문구만 보여 준다. (확정, PoC는 진행 중 상태만 시험한다)
const MESSAGES: Record<ErrorSituation, string> = {
  network: '일시적으로 연결이 원활하지 않아요',
  busy: '접속자가 많아요. 잠시 후 다시 시도해 주세요',
  rateLimit: '요청이 너무 많아요',
  sessionExpired: '입장 정보가 만료되었어요',
  forbidden: '이 이벤트에 참여할 수 없어요',
  notStarted: '아직 시작 전이에요',
  ended: '종료된 이벤트예요',
  alreadyClaimed: '이미 참여한 이벤트입니다.',
  ticketRequired: '대기 번호표가 필요합니다. 처음 화면에서 다시 입장해 주세요.',
  notFound: '존재하지 않는 이벤트입니다.',
  generic: '잠시 문제가 발생했습니다. 다시 시도해 주세요.',
}

const ACTIONS: Record<ErrorSituation, ErrorAction> = {
  network: 'retry',
  busy: 'retry',
  rateLimit: 'retry', // Retry-After가 있으면 아래에서 'auto'로 바꾼다
  sessionExpired: 'back',
  forbidden: 'back',
  notStarted: 'none',
  ended: 'none',
  alreadyClaimed: 'none',
  ticketRequired: 'none',
  notFound: 'none',
  generic: 'retry',
}

export function getErrorNotice(e: unknown): ErrorNoticeContent {
  const situation = classifyError(e)
  const retryAfterMs = e instanceof ApiError ? e.retryAfterMs : null
  const action = situation === 'rateLimit' && retryAfterMs !== null ? 'auto' : ACTIONS[situation]
  return { situation, message: MESSAGES[situation], action, retryAfterMs }
}
