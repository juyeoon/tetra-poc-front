import { describe, expect, it } from 'vitest'
import { computeDelay } from './useQueuePolling'

describe('computeDelay', () => {
  it('gap이 10000 초과면 10초', () => {
    expect(computeDelay(10001)).toBe(10000)
  })

  it('gap이 1000 초과 10000 이하면 5초', () => {
    expect(computeDelay(10000)).toBe(5000)
    expect(computeDelay(1001)).toBe(5000)
  })

  it('gap이 100 초과 1000 이하면 2초', () => {
    expect(computeDelay(1000)).toBe(2000)
    expect(computeDelay(101)).toBe(2000)
  })

  it('gap이 100 이하면 1초', () => {
    expect(computeDelay(100)).toBe(1000)
    expect(computeDelay(1)).toBe(1000)
    expect(computeDelay(0)).toBe(1000)
  })
})
