import { describe, expect, it } from 'vitest'
import { getEventId, parseEventIdFromQuery } from './eventId'

describe('parseEventIdFromQuery', () => {
  it('?event=가 숫자면 그 값을 돌려준다', () => {
    expect(parseEventIdFromQuery('?event=7')).toBe(7)
  })

  it('없거나 숫자가 아니면 null', () => {
    expect(parseEventIdFromQuery('')).toBeNull()
    expect(parseEventIdFromQuery('?event=abc')).toBeNull()
    expect(parseEventIdFromQuery('?event=')).toBeNull()
  })
})

describe('getEventId', () => {
  it('쿼리의 ?event=를 쓴다', () => {
    expect(getEventId('?event=5')).toBe(5)
  })

  it('쿼리가 없으면 기본값 1', () => {
    expect(getEventId('')).toBe(1)
  })
})
