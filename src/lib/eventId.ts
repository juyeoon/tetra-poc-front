import { config } from '../config'

// 호스트는 `{event id}.{tenant id}.루트도메인` 형태라 첫 라벨이 event id다. (CLAUDE.md §7)
export function parseEventIdFromHostname(hostname: string): number | null {
  const firstLabel = hostname.split('.')[0]
  return /^\d+$/.test(firstLabel) ? Number(firstLabel) : null
}

function parseEventIdFromQuery(search: string): number | null {
  const value = new URLSearchParams(search).get('event')
  return value !== null && /^\d+$/.test(value) ? Number(value) : null
}

// 우선순위: (1) ?event=<id> 쿼리 (2) 호스트 첫 라벨이 숫자면 그 값 (3) 설정 기본값
export function getEventId(
  search: string = window.location.search,
  hostname: string = window.location.hostname,
): number {
  return parseEventIdFromQuery(search) ?? parseEventIdFromHostname(hostname) ?? config.defaultEventId
}
