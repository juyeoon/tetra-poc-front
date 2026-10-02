import { ApiError } from '../api/unwrapApiEnvelope'

export type ErrorNoticeContent = {
  message: string
  // 새로고침으로 해결될 수 있는 오류만 버튼을 보여 준다. 세션 만료 같은 오류는 새로고침해도 같다.
  canReload: boolean
}

export const GENERIC_ERROR_MESSAGE = '잠시 문제가 발생했습니다. 새로고침 후 다시 시도해 주세요.'

// error.code별 안내 문구. 화면설계서에 없어 팀이 정한 임시 문구다. (CLAUDE.md §8, §10)
// ALREADY_CLAIMED는 이전 결과가 품절이었을 수도 있어서 성공처럼 보이지 않게 중립 문구를 쓴다.
const MESSAGES: Record<string, string> = {
  SESSION_NOT_FOUND: '접속 정보가 만료되었습니다. 이벤트 페이지에서 다시 입장해 주세요.',
  SESSION_EVENT_MISMATCH: '이 이벤트로 입장한 접속 정보가 아닙니다. 이벤트 페이지에서 다시 입장해 주세요.',
  EVENT_NOT_FOUND: '존재하지 않는 이벤트입니다.',
  NOT_FOUND: '존재하지 않는 이벤트입니다.',
  EVENT_NOT_STARTED: '아직 시작되지 않은 이벤트입니다.',
  EVENT_ENDED: '종료된 이벤트입니다.',
  TICKET_REQUIRED: '대기 번호표가 필요합니다. 처음 화면에서 다시 입장해 주세요.',
  ALREADY_CLAIMED: '이미 참여한 이벤트입니다.',
}

export function getErrorNotice(e: unknown): ErrorNoticeContent {
  if (e instanceof ApiError && e.code !== null && Object.prototype.hasOwnProperty.call(MESSAGES, e.code)) {
    return { message: MESSAGES[e.code], canReload: false }
  }
  return { message: GENERIC_ERROR_MESSAGE, canReload: true }
}
