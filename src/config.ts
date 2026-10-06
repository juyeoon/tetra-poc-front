export const config = {
  // 지터 상한. 02 화면에서 버튼을 누른 뒤 0~이 값(ms) 사이로 대기한다. (CLAUDE.md §4, §7 확정값)
  jitterMaxMs: 1000,

  // 폴링 실패가 이 시간(ms) 이상 이어질 때만 전체 에러 UI를 띄운다. 성공 응답이 한 번이라도 오면 초기화.
  // CloudFront가 만든 502/504가 엣지에 10초 캐시되기 때문이다. (추가지침 02 작업 1, 확정)
  pollingFailureLimitMs: 15000,

  // event id를 ?event= 쿼리에서 얻지 못할 때 쓰는 기본값 (DB 시드의 event_id).
  // 임시
  defaultEventId: 1,
};
