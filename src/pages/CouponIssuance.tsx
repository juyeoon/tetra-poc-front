import { useEffect, useState } from 'react'
import { claimCoupons, getCoupons, getEventInfo, type ClaimResult, type Coupon, type EventInfo } from '../api'
import { getEventId } from '../lib/eventId'

// 04 쿠폰 발급 + 05/06 결과 모달. (CLAUDE.md §4)
export default function CouponIssuance() {
  const eventId = getEventId()
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null)
  const [coupons, setCoupons] = useState<Coupon[] | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [result, setResult] = useState<ClaimResult | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getEventInfo(eventId), getCoupons(eventId)]).then(([info, list]) => {
      if (!cancelled) {
        setEventInfo(info)
        setCoupons(list)
      }
    })
    return () => {
      cancelled = true
    }
  }, [eventId])

  async function handleClaim() {
    if (claiming) return
    setClaiming(true)
    try {
      const res = await claimCoupons(eventId)
      setResult(res.result)
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
    // TODO(미정): returnUrl이 빈 문자열일 때 모달만 닫는다 (CLAUDE.md §4, §10).
    setResult(null)
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
            <button className="primary-button" onClick={handleConfirm}>
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
