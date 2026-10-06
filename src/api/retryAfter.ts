// Retry-After 헤더 값을 대기 시간(ms)으로 바꾼다. 값은 초 단위 정수이거나 HTTP 날짜다.
// 헤더가 없거나 해석할 수 없으면 null.
export function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const at = new Date(trimmed).getTime()
  if (!Number.isFinite(at)) return null
  return Math.max(0, at - nowMs)
}
