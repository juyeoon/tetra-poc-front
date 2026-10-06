import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeDelay, mergeCursor, startQueuePolling, type QueuePollingState } from './queuePoller'

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

describe('mergeCursor', () => {
  it('첫 값은 그대로 쓴다', () => {
    expect(mergeCursor(null, 50)).toBe(50)
  })

  it('이전 최댓값보다 크면 갱신한다', () => {
    expect(mergeCursor(50, 80)).toBe(80)
  })

  it('이전 최댓값보다 작으면(역행) 이전 값을 유지한다', () => {
    expect(mergeCursor(80, 50)).toBe(80)
  })

  it('같은 값이면 그대로 유지한다', () => {
    expect(mergeCursor(80, 80)).toBe(80)
  })
})

// --- 폴링 실패 처리 (추가지침 02 작업 1) ---
// fetch를 목으로 바꿔 실제 getQueueCursor를 통과시킨다. 가짜 타이머로 시간을 앞당긴다.
describe('startQueuePolling 실패 처리', () => {
  type Mode = 'ok' | '502' | 'html200'
  let mode: Mode
  let cursor: number
  let fetchTimes: number[]
  let states: QueuePollingState[]

  function response(): Response {
    if (mode === '502') {
      return new Response('<html>502 Bad Gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } })
    }
    if (mode === 'html200') {
      return new Response('<html>index</html>', { status: 200, headers: { 'content-type': 'text/html' } })
    }
    return new Response(JSON.stringify({ success: true, data: { cursor } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    mode = 'ok'
    cursor = 0
    fetchTimes = []
    states = []
    vi.stubGlobal('window', { location: { search: '' } })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetchTimes.push(Date.now())
        return response()
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const last = () => states[states.length - 1]

  // ticket 150, cursor 0 → gap 150, 다음 폴링 간격 2초. 성공 한 번을 받은 뒤 시작 상태를 만든다.
  async function startWithOneSuccess() {
    const stop = startQueuePolling({ eventId: 1, ticket: 150, onChange: (s) => states.push(s) })
    await vi.advanceTimersByTimeAsync(0)
    expect(last().gap).toBe(150)
    return stop
  }

  it('502가 12초 이어져도 에러 UI가 아니라 지연 표시만 뜨고 커서와 순번이 유지된다', async () => {
    const stop = await startWithOneSuccess()
    mode = '502'
    await vi.advanceTimersByTimeAsync(2000 + 12000) // 첫 실패는 2초 뒤, 거기서 12초
    expect(last().failed).toBe(false)
    expect(last().delayed).toBe(true)
    expect(last().cursor).toBe(0)
    expect(last().gap).toBe(150)
    stop()
  })

  it('502가 16초 이어지면 전체 에러 UI', async () => {
    const stop = await startWithOneSuccess()
    mode = '502'
    await vi.advanceTimersByTimeAsync(2000 + 16000)
    expect(last().failed).toBe(true)
    expect(last().delayed).toBe(false)
    stop()
  })

  it('502 도중 200이 한 번 오면 지연 표시가 사라지고 실패 시각이 초기화된다', async () => {
    const stop = await startWithOneSuccess()
    mode = '502'
    await vi.advanceTimersByTimeAsync(2000 + 10000)
    expect(last().delayed).toBe(true)

    mode = 'ok'
    cursor = 20
    await vi.advanceTimersByTimeAsync(2000)
    expect(last().delayed).toBe(false)
    expect(last().cursor).toBe(20)

    // 다시 502가 14초 이어진다. 초기화되지 않았다면 첫 실패 후 24초라 이미 실패했을 것이다.
    mode = '502'
    await vi.advanceTimersByTimeAsync(2000 + 14000)
    expect(last().failed).toBe(false)
    expect(last().delayed).toBe(true)
    stop()
  })

  it('200 + text/html 응답은 실패로 처리된다', async () => {
    const stop = await startWithOneSuccess()
    mode = 'html200'
    await vi.advanceTimersByTimeAsync(2000)
    expect(last().delayed).toBe(true)
    expect(last().failed).toBe(false)
    await vi.advanceTimersByTimeAsync(16000)
    expect(last().failed).toBe(true)
    stop()
  })

  it('실패 중에도 폴링 간격이 원래 간격과 같다', async () => {
    const stop = await startWithOneSuccess()
    mode = '502'
    await vi.advanceTimersByTimeAsync(10000)
    const gaps = fetchTimes.slice(1).map((t, i) => t - fetchTimes[i])
    expect(gaps.length).toBeGreaterThan(3)
    expect(gaps.every((g) => g === 2000)).toBe(true)
    stop()
  })

  it('4xx는 재시도하지 않고 바로 실패', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetchTimes.push(Date.now())
        return new Response(JSON.stringify({ success: false, error: { code: 'EVENT_NOT_FOUND', message: 'x' } }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    const stop = startQueuePolling({ eventId: 1, ticket: 150, onChange: (s) => states.push(s) })
    await vi.advanceTimersByTimeAsync(20000)
    expect(last().failed).toBe(true)
    expect(fetchTimes.length).toBe(1)
    stop()
  })

  it('멈춘 뒤에는 요청이 더 나가지 않는다', async () => {
    const stop = await startWithOneSuccess()
    stop()
    const before = fetchTimes.length
    await vi.advanceTimersByTimeAsync(30000)
    expect(fetchTimes.length).toBe(before)
  })
})
