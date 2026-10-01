export const config = {
  // 지터 상한. 02 화면에서 버튼을 누른 뒤 0~이 값(ms) 사이로 대기한다. (CLAUDE.md §4, §7 확정값)
  jitterMaxMs: 1000,

  // 폴링 실패 재시도 간격(ms). 폴링 스펙의 예시 값, 미정. (CLAUDE.md §6)
  // 임시: 미정
  pollingRetryDelayMs: 2000,

  // 폴링 연속 실패 상한 횟수. 폴링 스펙의 예시 값, 미정. (CLAUDE.md §6)
  // 임시: 미정
  pollingMaxFailures: 5,

  // event id를 쿼리/호스트에서 얻지 못할 때 쓰는 기본값 (DB 시드의 event_id).
  // 임시
  defaultEventId: 1,
};
