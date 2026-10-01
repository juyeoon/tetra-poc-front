import { useEffect, useState } from 'react'
import { getQueueCursor } from '../api'
import { config } from '../config'

// 경계값은 폴링 스펙(docs/api/폴링 클라이언트 구현 스펙.md)의 예시 코드와 동일하게 '초과(>)' 기준으로 구현한다.
// TODO(미정): CLAUDE.md의 표는 경계(1,000과 100)가 겹쳐 보인다. 확인 필요.
export function computeDelay(gap: number): number {
  if (gap > 10000) return 10000
  if (gap > 1000) return 5000
  if (gap > 100) return 2000
  return 1000
}

export type QueuePollingState = {
  cursor: number | null
  gap: number | null
  // 연속 실패 상한을 넘어 포기한 상태. (CLAUDE.md §6, 에러 UI는 TODO(미정))
  failed: boolean
}

// myTicketNumber가 확정된 뒤에만 폴링을 시작한다. null/undefined인 동안은 아무 것도 하지 않는다.
export function useQueuePolling(eventId: number, myTicketNumber: number | null | undefined): QueuePollingState {
  const [cursor, setCursor] = useState<number | null>(null)
  const [gap, setGap] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (myTicketNumber === null || myTicketNumber === undefined) {
      return
    }
    const ticket = myTicketNumber

    let cancelled = false
    let failureCount = 0
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    async function poll() {
      try {
        const res = await getQueueCursor(eventId)
        if (cancelled) return
        failureCount = 0
        setCursor(res.cursor)
        const currentGap = ticket - res.cursor
        setGap(currentGap)
        if (currentGap > 0) {
          timeoutId = setTimeout(poll, computeDelay(currentGap))
        }
      } catch {
        if (cancelled) return
        failureCount += 1
        if (failureCount >= config.pollingMaxFailures) {
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

  return { cursor, gap, failed }
}
