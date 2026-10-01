// API 호출은 전부 이 모듈에만 둔다. 화면 코드는 fetch/axios를 직접 쓰지 않는다. (CLAUDE.md §5)
// 1단계: 전부 목(mock) 값. 2단계에서 이 파일의 구현만 실제 호출로 바꾼다.
import { now } from '../lib/serverTime'
import { buildDummyEventInfo, type EventInfo } from '../mocks/event'

export type { EventInfo }

export type Coupon = {
  couponId: number
  name: string
  description: string
  remaining: number
}

export type ClaimResult = 'SUCCESS' | 'FAILED_SOLDOUT'

// 이벤트 정보: API 없음, PoC 전용 더미. (CLAUDE.md §5)
export async function getEventInfo(eventId: number): Promise<EventInfo> {
  return buildDummyEventInfo(eventId)
}

function getTicketStart(): number {
  const raw = new URLSearchParams(window.location.search).get('ticket')
  const n = raw !== null ? Number(raw) : NaN
  return Number.isFinite(n) ? n : 120
}

let nextTicket: number | null = null

// 호출할 때마다 새 번호를 돌려준다. 기본은 120부터 증가. `?ticket=<n>`으로 시작값 변경. (CLAUDE.md §5)
// 응답 모양은 미정이며 임시로 { ticket: number }를 쓴다.
export async function requestTicket(_eventId: number): Promise<{ ticket: number }> {
  if (nextTicket === null) {
    nextTicket = getTicketStart()
  }
  const ticket = nextTicket
  nextTicket += 1
  return { ticket }
}

function getCursorPerSec(): number {
  const raw = new URLSearchParams(window.location.search).get('cursorPerSec')
  const n = raw !== null ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : 20
}

let cursorStartTime: number | null = null

// 03이 열린 뒤(이 함수가 처음 호출된 시점 기준) 경과 시간에 비례해 커서가 올라간다.
// 기본 초당 20, `?cursorPerSec=<n>`으로 변경. 응답 스키마만 확정: { cursor: number } (CLAUDE.md §5, §6)
export async function getQueueCursor(_eventId: number): Promise<{ cursor: number }> {
  if (cursorStartTime === null) {
    cursorStartTime = now()
  }
  const elapsedSec = (now() - cursorStartTime) / 1000
  const cursor = Math.floor(elapsedSec * getCursorPerSec())
  return { cursor }
}

// DB 시드와 맞춰 10개 고정 반환. 이벤트당 쿠폰 최대 10종. (CLAUDE.md §5)
// 응답 모양은 미정이며 임시로 이 필드 구성을 쓴다. description이 실제 응답에 포함되는지도 미정.
export async function getCoupons(_eventId: number): Promise<Coupon[]> {
  return Array.from({ length: 10 }, (_, i) => ({
    couponId: i + 1,
    name: `PoC 쿠폰 ${i + 1}`,
    description: 'PoC 쿠폰입니다.',
    remaining: 10,
  }))
}

function getForcedClaimResult(): ClaimResult {
  const raw = new URLSearchParams(window.location.search).get('result')
  return raw === 'soldout' ? 'FAILED_SOLDOUT' : 'SUCCESS'
}

// 기본 SUCCESS, `?result=soldout`으로 FAILED_SOLDOUT 재현. (CLAUDE.md §5)
// 응답 모양은 미정이며 임시로 { result }를 쓴다.
export async function claimCoupons(_eventId: number): Promise<{ result: ClaimResult }> {
  return { result: getForcedClaimResult() }
}
