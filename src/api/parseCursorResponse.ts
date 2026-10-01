// CloudFront 설정이 잘못되면 API 요청에 index.html이 200으로 돌아올 수 있어 res.ok만으로는
// 이 경우를 걸러내지 못한다. 올바른 { cursor: number } 모양일 때만 통과시킨다. (추가지침 01 §2)
export function parseCursorResponse(body: unknown): { cursor: number } {
  if (typeof body === 'object' && body !== null && !Array.isArray(body) && 'cursor' in body) {
    const cursor = (body as { cursor: unknown }).cursor
    if (typeof cursor === 'number' && Number.isFinite(cursor)) {
      return { cursor }
    }
  }
  throw new Error('잘못된 커서 응답 형식')
}
