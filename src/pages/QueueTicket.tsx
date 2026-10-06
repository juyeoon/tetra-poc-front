import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestTicket } from '../api'
import { useQueuePolling } from '../hooks/useQueuePolling'
import { getEventId } from '../lib/eventId'
import ErrorNotice from './ErrorNotice'

// 03 번호표. 새로고침하면 새 번호를 받으므로 myTicketNumber는 어떤 스토리지에도 저장하지 않는다. (CLAUDE.md §4)
export default function QueueTicket() {
  const navigate = useNavigate()
  const eventId = getEventId()
  const [myTicketNumber, setMyTicketNumber] = useState<number | null>(null)
  const [ticketError, setTicketError] = useState<unknown>(null)
  const [ticketAttempt, setTicketAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    requestTicket(eventId).then(
      (res) => {
        if (!cancelled) setMyTicketNumber(res.ticket)
      },
      (e) => {
        if (!cancelled) setTicketError(e ?? new Error('번호표 요청 실패'))
      },
    )
    return () => {
      cancelled = true
    }
  }, [eventId, ticketAttempt])

  const { gap, delayed, failed, error: pollingError, restart } = useQueuePolling(eventId, myTicketNumber)

  useEffect(() => {
    if (gap !== null && gap <= 0) {
      // 쿼리(이벤트 id, 개발용 ?result= 등)를 다음 화면에도 유지한다.
      navigate(`/issue${window.location.search}`, { replace: true })
    }
  }, [gap, navigate])

  // 번호표 요청 실패, 폴링 실패가 15초 이상 이어진 경우의 에러 UI (추가지침 02). 다시 시도는 같은 요청을 한 번 다시 보낸다.
  if (ticketError !== null) {
    return (
      <ErrorNotice
        error={ticketError}
        onRetry={() => {
          setTicketError(null)
          setTicketAttempt((a) => a + 1)
        }}
      />
    )
  }
  if (failed) {
    return <ErrorNotice error={pollingError} onRetry={restart} />
  }

  const waitingCount = gap !== null ? Math.max(0, gap) : null

  return (
    <div className="page page-center">
      <div className="spinner" aria-hidden />
      <h1>잠시만 기다려 주세요</h1>
      <div className="caption">
        많은 분들이 접속 중입니다
        <br />
        새로고침하지 않아도 자동으로 이동합니다
      </div>
      <div className="waiting-box">
        <div className="caption">현재 대기자 수</div>
        <div className="waiting-count">
          {waitingCount === null ? '-' : waitingCount.toLocaleString('ko-KR')}명
        </div>
        {/* 폴링 실패가 15초 전이면 대기열 화면을 유지하고 지연 표시만 띄운다. 마지막 순번은 그대로 둔다. */}
        {delayed && <div className="caption">연결이 지연되고 있어요</div>}
      </div>
    </div>
  )
}
