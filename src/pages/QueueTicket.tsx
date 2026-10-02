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
  }, [eventId])

  const { gap, failed, error: pollingError } = useQueuePolling(eventId, myTicketNumber)

  useEffect(() => {
    if (gap !== null && gap <= 0) {
      // 쿼리(이벤트 id, 개발용 ?result= 등)를 다음 화면에도 유지한다.
      navigate(`/issue${window.location.search}`, { replace: true })
    }
  }, [gap, navigate])

  // 번호표 요청 실패, 폴링 포기 시 에러 UI (화면설계서에 없어 최소 문구)
  if (ticketError !== null || failed) {
    return <ErrorNotice error={ticketError ?? pollingError} />
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
      </div>
    </div>
  )
}
