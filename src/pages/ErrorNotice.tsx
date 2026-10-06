import { useEffect, useRef, useState } from 'react'
import { getEventInfo } from '../api'
import { getErrorNotice } from '../lib/errors'
import { getEventId } from '../lib/eventId'

// 에러 화면 공통 컴포넌트. 상황별 문구와 버튼만 바뀐다. 상황 판단은 lib/errors.ts. (추가지침 02 작업 3)
// onRetry는 "같은 요청을 한 번 다시 보내는" 함수다. 없으면 새로고침한다.
export default function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { message, action, retryAfterMs } = getErrorNotice(error)
  const [busy, setBusy] = useState(false)
  const [returnUrl, setReturnUrl] = useState('')
  const retryRef = useRef<() => void>(() => {})
  retryRef.current = onRetry ?? (() => window.location.reload())

  // 429에 Retry-After가 있으면 그만큼 기다린 뒤 자동으로 한 번 다시 보낸다.
  useEffect(() => {
    if (action !== 'auto' || retryAfterMs === null) return
    const id = setTimeout(() => retryRef.current(), retryAfterMs)
    return () => clearTimeout(id)
  }, [action, retryAfterMs])

  // 돌아갈 주소는 이벤트 정보의 returnUrl이다. /info는 인증이 없고 CDN 캐시라 세션이 없어도 받을 수 있다.
  // returnUrl이 비어 있거나 이벤트 정보를 받지 못하면 돌아갈 곳이 없어 버튼을 숨긴다. (확정)
  useEffect(() => {
    if (action !== 'back') return
    let cancelled = false
    getEventInfo(getEventId()).then(
      (info) => {
        if (!cancelled) setReturnUrl(info.returnUrl)
      },
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [action])

  // 연속으로 눌러도 요청이 겹치지 않게 첫 클릭 뒤에는 막는다. 요청이 다시 실패하면 새 에러 화면이 뜬다.
  function handleRetry() {
    if (busy) return
    setBusy(true)
    retryRef.current()
  }

  return (
    <div className="page page-center">
      <p>{message}</p>
      {action === 'retry' && (
        <button className="primary-button" disabled={busy} onClick={handleRetry}>
          다시 시도
        </button>
      )}
      {action === 'back' && returnUrl !== '' && (
        <button className="primary-button" onClick={() => (window.location.href = returnUrl)}>
          이벤트 페이지로 돌아가기
        </button>
      )}
    </div>
  )
}
