// 현재 시각을 얻는 유일한 통로. 카운트다운 등 모든 화면이 이 함수만 사용한다.
// TODO(미정): 서버 시각 보정(클럭 스큐 보정)은 아직 붙이지 않았다. 지금은 브라우저 시각을 그대로 돌려준다.
export function now(): number {
  return Date.now()
}
