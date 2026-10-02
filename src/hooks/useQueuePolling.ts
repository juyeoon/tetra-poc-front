import { useEffect, useRef, useState } from 'react'
import { getQueueCursor } from '../api'
import { isRetryableError } from '../api/isRetryableError'
import { config } from '../config'

// 경계값은 폴링 스펙(docs/api/폴링 클라이언트 구현 스펙.md)의 예시 코드와 동일하게 '초과(>)' 기준으로 구현한다.
// TODO(미정): CLAUDE.md의 표는 경계(1,000과 100)가 겹쳐 보인다. 확인 필요.
export function computeDelay(gap: number): number {
  if (gap > 10000) return 10000
  if (gap > 1000) return 5000
  if (gap > 100) return 2000
  return 1000
}

// 서로 다른 CloudFront 엣지 캐시를 번갈아 받으면 커서가 뒤로 갈 수 있다. 지금까지 받은 커서의
// 최댓값만 쓰고, 작은 값이 오면 무시한다. (폴링 스펙 §4, 추가지침 01 §3)
export function mergeCursor(prevMax: number | null, received: number): number {
  if (prevMax === null) return received
  return Math.max(prevMax, received)
}

export type QueuePollingState = {
  cursor: number | null
  gap: number | null
  // 연속 실패 상한을 넘어 포기한 상태. (CLAUDE.md §6, 에러 UI는 QueueTicket.tsx에서 확정)
  failed: boolean
  // 포기한 원인. error.code별 안내 문구를 고르는 데 쓴다.
  error: unknown
}

// myTicketNumber가 확정된 뒤에만 폴링을 시작한다. null/undefined인 동안은 아무 것도 하지 않는다.
export function useQueuePolling(eventId: number, myTicketNumber: number | null | undefined): QueuePollingState {
  const [cursor, setCursor] = useState<number | null>(null)
  const [gap, setGap] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const maxCursorRef = useRef<number | null>(null)

  useEffect(() => {
    if (myTicketNumber === null || myTicketNumber === undefined) {
      return
    }
    const ticket = myTicketNumber
    maxCursorRef.current = null

    let cancelled = false
    let failureCount = 0
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    async function poll() {
      try {
        const res = await getQueueCursor(eventId)
        if (cancelled) return
        failureCount = 0
        const merged = mergeCursor(maxCursorRef.current, res.cursor)
        maxCursorRef.current = merged
        setCursor(merged)
        const currentGap = ticket - merged
        setGap(currentGap)
        if (currentGap > 0) {
          timeoutId = setTimeout(poll, computeDelay(currentGap))
        }
      } catch (e) {
        if (cancelled) return
        failureCount += 1
        // 4xx는 재시도해도 결과가 같으므로 바로 포기한다. (백엔드 확인, CLAUDE.md §6)
        if (!isRetryableError(e) || failureCount >= config.pollingMaxFailures) {
          setError(e)
          setFailed(true)
          return
        }
        timeoutId = setTimeout(poll, config.pollingRetryDelayMs)
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timeoutId !== null) clearTimeout(timeoutId)
    }
  }, [eventId, myTicketNumber])

  return { cursor, gap, failed, error }
}
