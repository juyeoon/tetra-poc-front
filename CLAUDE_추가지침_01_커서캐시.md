# 추가 작업 지침 01 — 서빙 커서 캐시 대응

이 문서는 `CLAUDE.md`에 더하는 지침이다. `CLAUDE.md`와 어긋나는 부분이 있으면 작업 전에 먼저 알려라. 이 문서에 없는 결정은 임의로 하지 말고 `TODO(미정): ...`로 남긴다.

## 배경

서빙 커서 응답(`GET /api/issuance/events/{eventId}/queue/cursor`)은 CloudFront 엣지에서 약 1초 캐시하기로 했다. 이에 따라 커서 API는 인증 없는 공개 API가 되고, 캐시와 응답 헤더는 백엔드와 인프라가 맡는다.

프런트가 할 일은 세 가지다.

1. 캐시를 깨지 않는다.
2. 잘못된 응답을 실패로 처리한다.
3. 커서가 뒤로 가는 경우를 견딘다.

## 1. 캐시를 깨지 않는다

커서 요청에는 아래 어느 것도 하지 않는다. 하나라도 하면 엣지 캐시가 사용자마다 갈라지거나 우회되어, 이번 PoC의 측정 대상(캐시 효과)이 무의미해진다.

- 캐시 무효화용 쿼리 붙이기(`?_=${Date.now()}`, `?t=...` 등)
- `fetch`의 `cache` 옵션 지정
- 커스텀 요청 헤더 추가
- `credentials` 옵션 변경

같은 호스트 상대 경로에 대한 기본 `fetch` 그대로 둔다. 2단계 구현 규칙이지만, 1단계 코드에도 이 의도가 드러나도록 `src/api/index.ts`의 `getQueueCursor` 위에 주석으로 남긴다.

세션 쿠키가 같이 나가는 것은 브라우저 기본 동작이라 막지 않는다. CloudFront가 이 경로에서는 쿠키를 origin에 전달하지 않는다.

## 2. 잘못된 응답을 실패로 처리한다

CloudFront 설정이 잘못되면 API 요청에 `index.html`이 200으로 돌아올 수 있다. `res.ok`만 보면 이 경우를 성공으로 오인한다.

- `src/api/` 안에 순수 함수 `parseCursorResponse(body: unknown): { cursor: number }`를 만든다.
  - 입력이 객체이고 `cursor`가 유한한 숫자(`Number.isFinite`)일 때만 값을 돌려준다.
  - 그 외에는 예외를 던진다.
- `getQueueCursor`의 계약을 아래처럼 정한다.
  - 올바른 `{ cursor: number }`로만 resolve한다.
  - 다음은 모두 reject한다: `res.ok`가 false인 경우, JSON 파싱 실패, `parseCursorResponse` 실패.
  - 1단계 목도 이 계약을 지킨다.
- 훅은 reject를 기존 실패 처리(2초 후 재시도, 연속 5회 상한, `CLAUDE.md` §6)로 받는다. 새 실패 경로를 만들지 않는다.
- `parseCursorResponse`는 단위 테스트를 둔다. 아래 경우를 확인한다.
  - 정상 객체
  - `cursor` 누락
  - 문자열 숫자(`"12"`)
  - `NaN` / `Infinity`
  - `null`
  - 배열
  - HTML 문자열

## 3. 커서가 뒤로 가는 경우를 견딘다

사용자가 서로 다른 엣지 서버의 캐시를 번갈아 받으면, 직전보다 작은 커서를 받을 수 있다.

- `useQueuePolling` 안에서 지금까지 받은 커서의 최댓값만 쓴다. 작은 값이 오면 무시하고 직전 최댓값을 유지한다.
- 비교 로직은 순수 함수 `mergeCursor(prevMax: number | null, received: number): number`로 분리하고 단위 테스트를 둔다.
- `gap`, 대기자 수 표시, 다음 폴링 간격 계산은 모두 이 최댓값 기준으로 한다.
- 최댓값은 ref로 들고, 스토리지에 저장하지 않는다(`CLAUDE.md` §8). 새로고침하면 새 번호와 함께 처음부터 다시 시작한다.
- 이 동작은 폴링 스펙 원본에 아직 없다. 팀 제안으로 반영 예정이다. 코드에 `TODO(미정): 폴링 스펙에 커서 최댓값 유지 규칙 반영 대기` 주석을 단다.

## 4. 목 옵션 추가

`src/api/` 안에서만 구현한다. 기존 `?ticket=`, `?cursorPerSec=`와 함께 쓸 수 있어야 한다.

- `?cursorRegress=<n>`
  - n번째 호출마다 직전에 돌려준 값보다 작은 커서를 돌려준다.
  - 작은 값의 크기는 `cursorPerSec` 1~2초분 정도로 정하고 주석으로 남긴다.
  - 기본은 꺼짐이다.
- `?cursorFail=<n>`
  - n번째 호출마다 reject한다. 실패는 "형식이 잘못된 응답"(`parseCursorResponse` 실패)으로 만든다.
  - 기본은 꺼짐이다.
- `?cursorFail=always`
  - 매번 reject한다. 연속 실패 상한 후 에러 UI가 나오는지 확인하는 용도다.

## 5. 하지 않는 것

- 커서 응답의 캐시 여부를 프런트에서 판별하거나 로그로 남기지 않는다. 이 확인은 인프라 측정에서 `x-cache` 헤더로 한다.
- 탭 복귀 시 즉시 재요청은 여전히 하지 않는다(`CLAUDE.md` §6의 TODO 유지).
- 재시도 정책(고정 간격 vs 지수 백오프)은 바꾸지 않는다.

## 6. 완료 조건

1. `parseCursorResponse`와 `mergeCursor`의 단위 테스트가 통과한다.
2. `?cursorRegress=3`에서 대기자 수가 늘어나지 않고, 폴링 간격도 최댓값 기준으로 유지된다.
3. `?cursorFail=3`에서 실패 후 재시도되고, 화면이 멈추거나 크래시하지 않는다.
4. `?cursorFail=always`에서 5회 연속 실패 후 에러 UI가 나온다.
5. 커서 요청 코드에 캐시 무효화 쿼리, `cache` 옵션, 커스텀 헤더, `credentials` 변경이 없다.
6. 화면 코드에 `fetch`가 없고, 새 함수와 목 옵션이 모두 `src/api/`와 `src/hooks/` 안에 있다.

작업 후 아래 항목을 보고한다.

- 이 지침과 `CLAUDE.md` 또는 폴링 스펙 사이에 어긋난 점
- 새로 남긴 `TODO(미정)` 목록
