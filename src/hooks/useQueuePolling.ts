import { useCallback, useEffect, useState } from 'react'
import { initialPollingState, startQueuePolling, type QueuePollingState } from '../lib/queuePoller'

export { computeDelay, mergeCursor } from '../lib/queuePoller'
export type { QueuePollingState }

// myTicketNumber가 확정된 뒤에만 폴링을 시작한다. null/undefined인 동안은 아무 것도 하지 않는다.
// 폴링 로직 자체는 lib/queuePoller.ts에 있다. 언마운트하면 멈춘다.
export function useQueuePolling(
  eventId: number,
  myTicketNumber: number | null | undefined,
): QueuePollingState & { restart: () => void } {
  const [state, setState] = useState<QueuePollingState>(initialPollingState)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (myTicketNumber === null || myTicketNumber === undefined) {
      return
    }
    setState(initialPollingState)
    return startQueuePolling({ eventId, ticket: myTicketNumber, onChange: setState })
  }, [eventId, myTicketNumber, attempt])

  // 에러 화면의 "다시 시도". 같은 번호로 폴링을 처음부터 다시 시작한다.
  const restart = useCallback(() => setAttempt((a) => a + 1), [])

  return { ...state, restart }
}
