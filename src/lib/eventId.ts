import { config } from '../config'

// 호스트의 첫 라벨은 해시값이라 event id로 쓰지 않는다. 숫자 id는 세션 발급 뒤 이동하는
// /?event=<id> 쿼리로만 전달된다. (백엔드 확인, CLAUDE.md §7)
export function parseEventIdFromQuery(search: string): number | null {
  const value = new URLSearchParams(search).get('event')
  return value !== null && /^\d+$/.test(value) ? Number(value) : null
}

// 우선순위: (1) ?event=<id> 쿼리 (2) 설정 기본값
export function getEventId(search: string = window.location.search): number {
  return parseEventIdFromQuery(search) ?? config.defaultEventId
}
