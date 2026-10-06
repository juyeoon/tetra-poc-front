import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCoupons } from '../api'
import { classifyError, getErrorNotice } from './errors'

// fetch를 목으로 바꿔 실제 API 함수(getCoupons)를 통과시킨 뒤, 던져진 오류가 어떤 화면으로 가는지 본다.
function mockFetch(response: () => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async () => response()))
}

function html(status: number, headers: Record<string, string> = {}) {
  return () =>
    new Response('<html>CloudFront error</html>', {
      status,
      headers: { 'content-type': 'text/html', ...headers },
    })
}

function json(status: number, body: unknown) {
  return () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

async function noticeFor(): Promise<ReturnType<typeof getErrorNotice>> {
  try {
    await getCoupons(1)
  } catch (e) {
    return getErrorNotice(e)
  }
  throw new Error('예외가 던져지지 않음')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('상태 코드 → 에러 화면', () => {
  it('401은 입장 정보 만료, 테넌트 페이지로 돌아가기', async () => {
    mockFetch(json(401, { success: false, error: { code: 'SESSION_NOT_FOUND', message: 'x' } }))
    const n = await noticeFor()
    expect(n.situation).toBe('sessionExpired')
    expect(n.action).toBe('back')
  })

  it('본문 JSON이 없는 401도 상태 코드로 같은 화면', async () => {
    mockFetch(html(401))
    expect((await noticeFor()).situation).toBe('sessionExpired')
  })

  it('403은 참여할 수 없음, 테넌트 페이지로 돌아가기', async () => {
    mockFetch(json(403, { success: false, error: { code: 'SESSION_EVENT_MISMATCH', message: 'x' } }))
    const n = await noticeFor()
    expect(n.situation).toBe('forbidden')
    expect(n.action).toBe('back')
  })

  it('429 + Retry-After가 있으면 그만큼 기다린 뒤 자동 재시도', async () => {
    mockFetch(html(429, { 'retry-after': '3' }))
    const n = await noticeFor()
    expect(n.situation).toBe('rateLimit')
    expect(n.action).toBe('auto')
    expect(n.retryAfterMs).toBe(3000)
  })

  it('429 + Retry-After가 없으면 다시 시도 버튼', async () => {
    mockFetch(html(429))
    const n = await noticeFor()
    expect(n.situation).toBe('rateLimit')
    expect(n.action).toBe('retry')
    expect(n.retryAfterMs).toBeNull()
  })

  it('503은 접속 폭주, 다시 시도 버튼', async () => {
    mockFetch(html(503))
    const n = await noticeFor()
    expect(n.situation).toBe('busy')
    expect(n.action).toBe('retry')
  })

  it('504와 502는 연결 오류, 다시 시도 버튼', async () => {
    for (const status of [502, 504]) {
      mockFetch(html(status))
      const n = await noticeFor()
      expect(n.situation).toBe('network')
      expect(n.action).toBe('retry')
    }
  })

  it('네트워크 예외는 연결 오류', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const n = await noticeFor()
    expect(n.situation).toBe('network')
    expect(n.action).toBe('retry')
  })

  it('200인데 text/html이면 연결 오류', async () => {
    mockFetch(html(200))
    const n = await noticeFor()
    expect(n.situation).toBe('network')
    expect(n.action).toBe('retry')
  })

  it('알 수 없는 4xx와 5xx는 일반 오류 화면', async () => {
    mockFetch(json(418, { success: false, error: { code: 'TEAPOT', message: 'x' } }))
    expect((await noticeFor()).situation).toBe('generic')
    mockFetch(json(500, { success: false, error: { code: 'INTERNAL_ERROR', message: 'x' } }))
    const n = await noticeFor()
    expect(n.situation).toBe('generic')
    expect(n.action).toBe('retry')
  })
})

describe('본문 code로 세분', () => {
  it('409 코드는 시작 전, 종료, 이미 참여로 나뉜다', async () => {
    const codes: [string, string][] = [
      ['EVENT_NOT_STARTED', 'notStarted'],
      ['EVENT_ENDED', 'ended'],
      ['ALREADY_CLAIMED', 'alreadyClaimed'],
    ]
    for (const [code, situation] of codes) {
      mockFetch(json(409, { success: false, error: { code, message: 'x' } }))
      expect((await noticeFor()).situation).toBe(situation)
    }
  })

  it('ALREADY_CLAIMED 문구는 성공을 암시하지 않는다', () => {
    const n = getErrorNotice({})
    expect(n.message).not.toContain('발급되었')
  })

  it('502/504의 본문은 믿지 않는다(JSON이어도 상태 코드로만)', async () => {
    mockFetch(json(502, { success: false, error: { code: 'ALREADY_CLAIMED', message: 'x' } }))
    expect((await noticeFor()).situation).toBe('network')
  })

  it('Object.prototype 키 같은 코드에 속지 않는다', async () => {
    mockFetch(json(400, { success: false, error: { code: 'toString', message: 'x' } }))
    expect((await noticeFor()).situation).toBe('generic')
  })
})

describe('classifyError', () => {
  it('ApiError가 아닌 예외는 연결 오류', () => {
    expect(classifyError(new TypeError('x'))).toBe('network')
  })
})
