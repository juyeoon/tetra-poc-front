import { describe, expect, it } from 'vitest'
import { parseCursorResponse } from './parseCursorResponse'

describe('parseCursorResponse', () => {
  it('정상 객체는 그대로 통과한다', () => {
    expect(parseCursorResponse({ cursor: 42 })).toEqual({ cursor: 42 })
  })

  it('cursor가 없으면 예외', () => {
    expect(() => parseCursorResponse({})).toThrow()
  })

  it('cursor가 문자열 숫자면 예외', () => {
    expect(() => parseCursorResponse({ cursor: '12' })).toThrow()
  })

  it('cursor가 NaN이면 예외', () => {
    expect(() => parseCursorResponse({ cursor: NaN })).toThrow()
  })

  it('cursor가 Infinity면 예외', () => {
    expect(() => parseCursorResponse({ cursor: Infinity })).toThrow()
  })

  it('null이면 예외', () => {
    expect(() => parseCursorResponse(null)).toThrow()
  })

  it('배열이면 예외', () => {
    expect(() => parseCursorResponse([1, 2, 3])).toThrow()
  })

  it('HTML 문자열이면 예외', () => {
    expect(() => parseCursorResponse('<!doctype html><html></html>')).toThrow()
  })
})
