import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/unwrapApiEnvelope'
import { GENERIC_ERROR_MESSAGE, getErrorNotice } from './errorNotice'

describe('getErrorNotice', () => {
  it('알려진 error.code는 코드별 문구이고 새로고침 버튼이 없다', () => {
    const n = getErrorNotice(new ApiError('x', 'ALREADY_CLAIMED', 409))
    expect(n.message).toBe('이미 참여한 이벤트입니다.')
    expect(n.canReload).toBe(false)
  })

  it('EVENT_ENDED는 종료 문구이고 새로고침 버튼이 없다', () => {
    const n = getErrorNotice(new ApiError('x', 'EVENT_ENDED', 409))
    expect(n.message).toBe('종료된 이벤트입니다.')
    expect(n.canReload).toBe(false)
  })

  it('ALREADY_CLAIMED 문구는 성공을 암시하지 않는다', () => {
    const n = getErrorNotice(new ApiError('x', 'ALREADY_CLAIMED', 409))
    expect(n.message).not.toContain('발급되었')
  })

  it('모르는 코드와 코드 없는 오류는 기본 문구와 새로고침 버튼', () => {
    expect(getErrorNotice(new ApiError('x', 'INTERNAL_ERROR', 500))).toEqual({
      message: GENERIC_ERROR_MESSAGE,
      canReload: true,
    })
    expect(getErrorNotice(new ApiError('x', null, 503)).canReload).toBe(true)
    expect(getErrorNotice(new TypeError('Failed to fetch')).canReload).toBe(true)
  })

  it('Object.prototype 키 같은 코드에 속지 않는다', () => {
    expect(getErrorNotice(new ApiError('x', 'toString', 400)).message).toBe(GENERIC_ERROR_MESSAGE)
  })
})
