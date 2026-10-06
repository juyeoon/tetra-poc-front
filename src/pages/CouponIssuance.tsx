import { useEffect, useState } from 'react'
import { claimCoupons, getCoupons, getEventInfo, type ClaimResult, type Coupon, type EventInfo } from '../api'
import { classifyError } from '../lib/errors'
import { getEventId } from '../lib/eventId'
import ErrorNotice from './ErrorNotice'

// 04 쿠폰 발급 + 05/06 결과 모달. (CLAUDE.md §4)
export default function CouponIssuance() {
  const eventId = getEventId()
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null)
  const [coupons, setCoupons] = useState<Coupon[] | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [result, setResult] = useState<ClaimResult | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [returnMissing, setReturnMissing] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // claim 응답을 못 받은 상태(네트워크 예외, 502, 504). 서버에서는 발급이 끝났을 수 있어 실패로 보지 않는다.
  const [claimPending, setClaimPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([getEventInfo(eventId), getCoupons(eventId)]).then(
      ([info, list]) => {
        if (!cancelled) {
          setEventInfo(info)
          setCoupons(list)
        }
      },
      (e) => {
        if (!cancelled) setError(e ?? new Error('불러오기 실패'))
      },
    )
    return () => {
      cancelled = true
    }
  }, [eventId, attempt])

  async function handleClaim() {
    if (claiming) return
    setClaiming(true)
    try {
      const res = await claimCoupons(eventId)
      setClaimPending(false)
      setResult(res.result)
    } catch (e) {
      if (classifyError(e) === 'network') {
        // 응답을 못 받았다. 에러 화면이 아니라 "발급 여부 확인 중"으로 둔다. (추가지침 02 작업 2)
        // 결과 조회 API가 없다(백엔드 확인). "다시 확인"으로 claim을 다시 보내 확정한다. (확정)
        // 이미 처리됐으면 ALREADY_CLAIMED가 와서 성공/품절은 알 수 없다.
        setClaimPending(true)
      } else {
        setClaimPending(false)
        setError(e ?? new Error('쿠폰 발급 실패'))
      }
    } finally {
      setClaiming(false)
    }
  }

  function handleConfirm() {
    const returnUrl = eventInfo?.returnUrl ?? ''
    if (returnUrl !== '') {
      window.location.href = returnUrl
      return
    }
    // returnUrl이 비어 있으면 이동하지 않고 모달 안에 안내 문구를 보여 준다. (CLAUDE.md §4)
    setReturnMissing(true)
  }

  if (error !== null) {
    // 다시 시도: 같은 요청(쿠폰 목록 등)을 한 번 다시 보낸다.
    return (
      <ErrorNotice
        error={error}
        onRetry={() => {
          setError(null)
          setAttempt((a) => a + 1)
        }}
      />
    )
  }

  if (!eventInfo || !coupons) {
    return <div className="page page-wide page-center">불러오는 중...</div>
  }

  return (
    <div className="page page-wide">
      {eventInfo.bannerUrl !== '' && (
        <img className="banner" src={eventInfo.bannerUrl} alt="" />
      )}
      <div className="issue-header">
        <div>
          <h1>{eventInfo.name}</h1>
          <div className="caption">받을 수 있는 쿠폰 {coupons.length}장</div>
        </div>
        <button className="primary-button issue-header-button" disabled={claiming} onClick={handleClaim}>
          쿠폰 받기 (전체 발급)
        </button>
      </div>
      <ul className="coupon-list">
        {coupons.map((coupon) => (
          <li key={coupon.couponId} className="coupon-item">
            <div className="coupon-name">{coupon.name}</div>
            <div className="coupon-description">{coupon.description}</div>
          </li>
        ))}
      </ul>

      {claimPending && (
        <div className="modal-overlay">
          <div className="modal">
            {/* 문구는 화면설계서에 없어 팀이 정했다. */}
            <p className="modal-message">발급 여부를 확인하고 있어요</p>
            <button className="primary-button" disabled={claiming} onClick={handleClaim}>
              다시 확인
            </button>
          </div>
        </div>
      )}

      {result !== null && (
        <div className="modal-overlay">
          <div className="modal">
            {result === 'SUCCESS' ? (
              <>
                <p className="modal-message">쿠폰이 발급되었습니다</p>
              </>
            ) : (
              <>
                <p className="modal-message">쿠폰이 모두 소진되었습니다</p>
                <p className="modal-submessage">
                  아쉽지만 준비된 수량이 모두 발급되었어요. 다음 이벤트에서 다시 만나요.
                </p>
              </>
            )}
            {returnMissing && (
              <p className="modal-submessage">이동할 페이지 주소를 찾을 수 없습니다.</p>
            )}
            <button className="primary-button" onClick={handleConfirm}>
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
