import { describe, expect, it } from 'vitest'
import { parseEventIdFromHostname, getEventId } from './eventId'

describe('parseEventIdFromHostname', () => {
  it('첫 라벨이 숫자면 그 값을 돌려준다', () => {
    expect(parseEventIdFromHostname('7.3.example.com')).toBe(7)
  })

  it('첫 라벨이 숫자가 아니면 null', () => {
    expect(parseEventIdFromHostname('localhost')).toBeNull()
    expect(parseEventIdFromHostname('www.example.com')).toBeNull()
  })
})

describe('getEventId', () => {
  it('쿼리의 ?event=가 최우선', () => {
    expect(getEventId('?event=5', '9.1.example.com')).toBe(5)
  })

  it('쿼리가 없으면 호스트 첫 라벨', () => {
    expect(getEventId('', '9.1.example.com')).toBe(9)
  })

  it('둘 다 없으면 기본값 1', () => {
    expect(getEventId('', 'localhost')).toBe(1)
  })
})
