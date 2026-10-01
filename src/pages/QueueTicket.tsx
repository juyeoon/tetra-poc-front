import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestTicket } from '../api'
import { useQueuePolling } from '../hooks/useQueuePolling'
import { getEventId } from '../lib/eventId'

// 03 번호표. 새로고침하면 새 번호를 받으므로 myTicketNumber는 어떤 스토리지에도 저장하지 않는다. (CLAUDE.md §4)
export default function QueueTicket() {
  const navigate = useNavigate()
  const eventId = getEventId()
  const [myTicketNumber, setMyTicketNumber] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    requestTicket(eventId).then((res) => {
      if (!cancelled) setMyTicketNumber(res.ticket)
    })
    return () => {
      cancelled = true
    }
  }, [eventId])

  const { gap, failed } = useQueuePolling(eventId, myTicketNumber)

  useEffect(() => {
    if (gap !== null && gap <= 0) {
      // 쿼리(이벤트 id, 개발용 ?result= 등)를 다음 화면에도 유지한다.
      navigate(`/issue${window.location.search}`, { replace: true })
    }
  }, [gap, navigate])

  // TODO(미정): 폴링 연속 실패 시 에러 UI는 화면설계서에 없다. 최소 문구만 둔다.
  if (failed) {
    return (
      <div className="page page-center">
        <p>잠시 문제가 발생했습니다. 잠시 후 새로고침해 주세요.</p>
      </div>
    )
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
