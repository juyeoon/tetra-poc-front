import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEventInfo, type EventInfo } from '../api'
import { config } from '../config'
import { getEventId } from '../lib/eventId'
import { now } from '../lib/serverTime'

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

// 02 대기방. 02의 카운트다운/지터 코드는 03의 폴링 코드와 완전히 별개다 (CLAUDE.md §4).
export default function WaitingRoom() {
  const navigate = useNavigate()
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null)
  const [remainingMs, setRemainingMs] = useState<number | null>(null)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    const eventId = getEventId()
    let cancelled = false
    getEventInfo(eventId).then((info) => {
      if (!cancelled) setEventInfo(info)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!eventInfo) return

    const startAtMs = new Date(eventInfo.startAt).getTime()
    const tick = () => setRemainingMs(startAtMs - now())
    tick()
    const intervalId = setInterval(tick, 250)
    return () => clearInterval(intervalId)
  }, [eventInfo])

  if (!eventInfo || remainingMs === null) {
    return <div className="page page-center">불러오는 중...</div>
  }

  const started = remainingMs <= 0

  function handleClick() {
    if (!started || joining) return
    setJoining(true)
    const delay = Math.random() * config.jitterMaxMs
    setTimeout(() => {
      // 쿼리(이벤트 id, 개발용 ?ticket=/?cursorPerSec= 등)를 다음 화면에도 유지한다.
      navigate(`/queue${window.location.search}`)
    }, delay)
  }

  return (
    <div className="page page-center">
      {eventInfo.bannerUrl !== '' && (
        <img className="banner" src={eventInfo.bannerUrl} alt="" />
      )}
      <h1>{started ? '이벤트가 시작되었습니다!' : '이벤트 시작까지 기다려주세요'}</h1>
      <div className="countdown">{formatCountdown(remainingMs)}</div>
      <div className="caption">이벤트 시작까지 남은 시간</div>
      <button
        className="primary-button"
        disabled={!started || joining}
        onClick={handleClick}
      >
        {joining ? '이동 중...' : '쿠폰 받으러 가기'}
      </button>
    </div>
  )
}
