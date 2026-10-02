# Tetra PoC 프런트 지침

이 파일은 Claude Code가 읽는 지침이다. 지침에 없는 결정은 임의로 하지 말고, `TODO(미정): ...` 주석으로 남기고 작업 결과에서 질문으로 알려라.

## 1. 목적과 범위

Tetra는 여러 테넌트가 선착순 쿠폰 이벤트를 운영하는 멀티테넌트 SaaS다. 이 저장소는 PoC의 **Issuance Service 프런트**다.

PoC의 목표는 두 가지다.

1. 백엔드가 트래픽을 얼마나 감당하는지 스펙을 측정한다.
2. CloudFront가 설계대로 동작하는지 확인한다.

이 프런트는 **부하를 만드는 쪽이 아니다.** 부하는 별도 도구가 만든다. 이 프런트의 역할은 두 가지다.

- CloudFront 동작을 실제 브라우저로 확인하는 화면 (경로 분기, 쿠키, 캐시, 새로고침)
- 부하 스크립트가 따라 할 브라우저 동작의 기준 구현 (지터, 폴링, 재시도)

**작업은 두 단계다.**

- **1단계 (지금): 스켈레톤.** 화면 구조, 라우팅, 더미 데이터, 빌드 설정, 그리고 폴링 훅까지 만든다. **실제 API 호출은 구현하지 않고** 목(mock)으로 대체한다.
- **2단계 (나중에 따로 지시): 실제 API 연결.** `src/api/`의 구현만 바꾼다. 화면 코드는 바꾸지 않는다. 그래서 1단계에서 호출이 `src/api/` 한 곳에만 있어야 한다.

## 2. 기술 스택과 실행

- Vite + React + TypeScript, 패키지 매니저는 npm
- 라우팅은 `react-router-dom`의 history 방식(`BrowserRouter`)
- 스타일은 일반 CSS 한 벌, 최소한으로. 디자인 작업은 하지 않는다.
- 위 외의 라이브러리는 이유를 남기고 추가한다.

```
npm install
npm run dev      # 로컬 개발
npm run build    # dist/ 정적 파일 생성
```

빌드 결과는 **정적 파일(HTML, JS, CSS, 이미지)만**이어야 하고 서버 런타임이 필요 없어야 한다. Next.js 같은 SSR, 서버 라우트, 미들웨어는 쓰지 않는다.

## 3. 화면과 라우팅

02, 03, 04는 하나의 SPA 안의 라우트다. 05, 06은 04 안의 모달이며 별도 경로가 없다.

| 화면 | 경로 | 내용 |
| --- | --- | --- |
| 02 대기방 | `/` | 카운트다운, 시작하면 버튼 활성화 |
| 03 번호표 | `/queue` | 내 번호와 대기자 수 표시, 폴링 |
| 04 쿠폰 발급 | `/issue` | 쿠폰 목록과 쿠폰 받기 버튼, 결과 모달(05 성공, 06 품절) |

- `/api/*`는 백엔드(ALB)가 쓰는 경로다. 프런트 경로로 **절대 쓰지 않는다.**
- 앱은 호스트의 **루트**(`/`)에 배포된다. Vite의 `base`를 설정하지 않는다.
- 해시 라우팅(`/#/queue`)은 쓰지 않는다. 새로고침 때 CloudFront의 403/404 복구 설정을 시험해야 하기 때문이다.

화면설계서는 `docs/screens/`에 있다(사람이 넣어 둔다). UI-IS-02, 03, 04, 05, 06 문서를 읽고 화면 구성과 문구를 따른다. UI-IS-01(테넌트 메인 페이지)은 이 저장소의 범위가 아니다.

참고 자료도 `docs/`에 있다(사람이 넣어 둔다): `docs/api/Tetra_API_정의서_Poc.xlsx`(API 목록), `docs/api/폴링_클라이언트_구현_스펙.md`(폴링 스펙), `docs/db/PoC_데이터베이스_정의서.md`(DB 정의서, 필드 이름과 값의 출처). 이 지침의 §5~§7은 그 셋을 정리한 것이며, 어긋나면 원본을 따르고 어긋난 점을 알려라.

## 4. 화면 동작

### 02 대기방 (`/`)

- 이벤트 시작 전에는 카운트다운과 비활성 버튼을, 시작 후에는 활성 버튼을 보여 준다.
- 배너(`bannerUrl`)를 보여 준다. 값이 빈 문자열이면 이미지를 그리지 않는다(깨진 이미지 금지).
- 카운트다운의 현재 시각은 `src/lib/serverTime.ts`의 `now()` 함수 하나로만 얻는다. 지금은 `Date.now()`를 돌려준다. 서버 시각 보정은 나중에 이 함수에 끼울 자리다(미정).
- 버튼을 누르면 **0~`jitterMaxMs` 사이의 랜덤 시간만큼 기다린 뒤** `/queue`로 이동한다. 기다리는 동안 버튼은 비활성이고 진행 중임을 보여 준다.
- 이 화면의 카운트다운과 지터 코드는 03의 폴링 코드와 **완전히 별개**다. 섞지 않는다.

### 03 번호표 (`/queue`)

- 화면이 열릴 때 `requestTicket(eventId)`를 **한 번** 호출해 번호를 받는다. 이 번호가 `myTicketNumber`다.
- **새로고침하면 새 번호를 받는다.** 그러므로 번호를 어떤 스토리지에도 저장하지 않는다.
- 번호를 받은 뒤에만 폴링을 시작한다(§6). 대기자 수는 `max(0, myTicketNumber − cursor)`로 보여 준다.
- `gap = myTicketNumber − cursor`가 0 이하가 되면 폴링을 멈추고 `/issue`로 이동한다(`replace`).

### 04 쿠폰 발급 (`/issue`)

- 열릴 때 `getCoupons(eventId)`로 쿠폰 목록을 받아 이름과 설명을 보여 주고(**잔여 매수는 화면에 보여 주지 않는다**, 확정. 응답의 `remaining`은 타입에 두지 않는다) "쿠폰 받기 (전체 발급)" 버튼을 둔다.
- 버튼을 누르면 `claimCoupons(eventId)`를 호출한다. 결과에 따라 모달을 연다.
  - 성공(05): "쿠폰이 발급되었습니다"
  - 품절(06): "쿠폰이 모두 소진되었습니다" / "아쉽지만 준비된 수량이 모두 발급되었어요. 다음 이벤트에서 다시 만나요."
- 모달의 "확인"을 누르면 이벤트 정보의 `returnUrl`(테넌트 페이지)로 이동한다. `returnUrl`이 빈 문자열이면 이동하지 않고 모달 안에 "이동할 페이지 주소를 찾을 수 없습니다."를 보여 준다(확정, 모달은 닫지 않는다).

## 5. API

API 호출은 전부 `src/api/index.ts` 한 곳에 둔다. **화면 코드에서 `fetch`나 `axios`를 직접 쓰지 않는다.** 1단계에서는 모든 함수가 목 값을 돌려준다.

`{eventId}`는 `src/lib/eventId.ts`에서 얻는다(§7). 경로는 같은 호스트의 **상대 경로**만 쓴다.

| 용도 | 메서드와 경로 | 프런트가 호출하는가 | 스키마 |
| --- | --- | --- | --- |
| 세션 발급 | `GET /api/issuance/session` | **아니오.** 테넌트 서버의 302가 브라우저를 이 주소로 보내고, 서버가 세션 쿠키를 담은 302로 02(`/`)에 돌려보낸다 | 해당 없음 |
| 번호표 발급 | `POST /api/issuance/events/{eventId}/ticket` | 예. 03이 열릴 때 한 번 | `data`: `{ ticketNumber: number }` (확정) |
| 서빙 커서 | `GET /api/issuance/events/{eventId}/queue/cursor` | 예. 03의 폴링 | `data`: `{ cursor: number }` (확정) |
| 쿠폰 목록 | `GET /api/issuance/events/{eventId}/coupons` | 예. 04가 열릴 때 | `data`: `{ coupons: [...] }` (확정. 항목: `couponId`, `name`, `description`, `remaining`. `remaining`(Redis 실시간 재고)은 화면에 보여 주지 않으므로 쓰지 않는다) |
| 쿠폰 발급 | `POST /api/issuance/events/{eventId}/coupons/claim` | 예. 04의 버튼 | `data`: `{ result: 'SUCCESS' \| 'SOLD_OUT', coupons: [...] }` (확정) |

**응답 봉투(확정, 5개 API 공통)**: 성공은 `{ success: true, data: {...} }`, 에러는 `{ success: false, error: { code, message } }`이고 HTTP 상태 코드는 4xx/5xx다(에러 응답에는 `Cache-Control: no-store`). 봉투가 아닌 응답은 비정상(설정 오류 등)이므로 통과시키지 않고 예외로 처리한다. **예외**: 429, 502, 503, 504는 백엔드가 아니라 CloudFront나 ALB가 만든 응답이라 봉투가 아니다. 본문을 믿지 말고 상태 코드로만 판단한다. 에러 처리는 `error.code`를 쓴다.

| HTTP | code | 언제 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | 경로 값 형식 오류 |
| 401 | `SESSION_NOT_FOUND` | 세션 쿠키 없음, 세션 만료 |
| 403 | `SESSION_EVENT_MISMATCH` | 다른 이벤트의 세션으로 접근 |
| 404 | `EVENT_NOT_FOUND`, `NOT_FOUND` | 없는 이벤트, 없는 경로 |
| 405 | `METHOD_NOT_ALLOWED` | 허용하지 않는 메서드 |
| 409 | `EVENT_NOT_STARTED` | 이벤트 시작 전 번호표 요청 |
| 409 | `EVENT_ENDED` | 종료 시각(`end_at`) 이후 번호표, claim 요청. 재시도하지 않는다 |
| 409 | `TICKET_REQUIRED` | 번호표 없이 claim |
| 409 | `ALREADY_CLAIMED` | 이 사용자가 이 이벤트에서 이미 claim 처리됨(번호표 요청과 claim 모두에서 온다. 이전 결과가 성공이든 품절이든 같은 코드, 세션이 아니라 사용자 기준). 성공처럼 보여 주면 안 된다 |
| 500 | `INTERNAL_ERROR` | 서버 내부 오류 |

번호표는 401, 403, 404, 409(`EVENT_NOT_STARTED`, `EVENT_ENDED`, `ALREADY_CLAIMED`)가, 커서는 404, 400, 500만(인증 없음), 쿠폰 목록은 401, 403이, claim은 401, 403, 409(`TICKET_REQUIRED`, `ALREADY_CLAIMED`, `EVENT_ENDED`)가, 이벤트 정보는 404 `EVENT_NOT_FOUND`, 400이 온다. 쿠폰 목록, 커서, 이벤트 정보는 종료 뒤에도 정상 응답한다. 세션이 필요한 API는 세션 확인을 먼저 하므로 세션 없이 잘못된 메서드로 부르면 405가 아니라 401이다. 품절(`SOLD_OUT`)은 에러가 아니라 200이다.

**재시도 기준(백엔드 확인)**: 4xx는 재시도하지 않는다. 5xx, 네트워크 오류, 인프라의 429/502/503/504만 재시도한다(`src/api/isRetryableError.ts`).

**세션**: 만든 시점부터 2시간 고정이고 대기와 폴링 중에도 늘어나지 않는다. 커서 API는 인증이 없어서 세션이 만료돼도 폴링은 정상이고, 다음 쿠폰 목록이나 claim에서 401 `SESSION_NOT_FOUND`로 드러난다.

**서버 시각**: 서버 시각 API는 없다. 모든 응답의 `Date` 헤더(초 단위, GMT)를 JS에서 읽을 수 있고, 캐시된 응답(커서)은 `Age` 헤더를 더해 보정한다. 이벤트 시작 시각은 이벤트 정보 API로 받게 되므로(아래) 그 API를 붙인 뒤에 보정을 쓸지 정한다(§10).

**이벤트 정보 API(확정, 구현 완료, 프런트 연결됨)**: `GET /api/issuance/events/{eventId}/info`(인증과 쿠키 불필요). 경로는 `/{eventId}`가 아니라 `/{eventId}/info`다(CDN 캐시를 이 경로에만 걸기 위함). 응답 `data`는 `{ eventId, name, startAt, endAt, bannerUrl, returnUrl }`이고 시각은 `+09:00`이 붙은 ISO 문자열이다. `bannerUrl`과 `returnUrl`은 빈 문자열일 수 있고 나머지는 항상 있다. 에러는 404 `EVENT_NOT_FOUND`, 400 `INVALID_REQUEST`다. CDN에서 최대 60초 캐시되므로(`s-maxage=60`) 커서처럼 캐시 무효화 쿼리나 커스텀 헤더를 붙이지 않는다. `getEventInfo`가 이 API를 호출한다. 단 개발용으로 **`?startsIn=<초>`가 있으면 더미**(`src/mocks/event.ts`)를 쓴다(로컬 DB 시드의 시작 시각이 이미 지나 실제 응답으로는 카운트다운을 볼 수 없기 때문). 404, 400은 재시도하지 않고 02, 03, 04 모두 `ErrorNotice`로 보낸다. 지터 상한(`jitterMaxMs`)은 API로 받지 않고 프런트 설정으로 둔다.

**순서 검증은 없다(PoC 결정)**: 서버는 내 번호 ≤ 커서를 검증하지 않아서 순서 전에 claim을 호출해도 재고가 있으면 성공한다. "아직 내 순서 아님" 에러 코드는 없다. 순서를 지키는 장치는 프런트가 `gap <= 0`일 때만 `/issue`로 이동하는 것 하나뿐이다. 쿠폰 목록은 세션만 있으면 조회된다. claim 처리 뒤에는 쿠폰 목록이 정상 200이고, 번호표 요청과 claim은 `ALREADY_CLAIMED`로 막힌다.

아래 시그니처는 **화면 코드가 보는 모양**이다. API 응답과 다른 곳은 `src/api/`가 옮겨 담는다: `ticketNumber`→`ticket`, `data.coupons`→배열, `SOLD_OUT`→`FAILED_SOLDOUT`(DB `issuance_history.result` 값). 화면 쪽 이름을 응답에 맞출지는 미정이다.

```ts
getEventInfo(eventId: number): Promise<EventInfo>        // GET /info. ?startsIn= 이 있으면 더미
requestTicket(eventId: number): Promise<{ ticket: number }>   // 호출할 때마다 새 번호
getQueueCursor(eventId: number): Promise<{ cursor: number }>
getCoupons(eventId: number): Promise<{ couponId: number; name: string; description: string }[]>
claimCoupons(eventId: number): Promise<{ result: 'SUCCESS' | 'FAILED_SOLDOUT' }>
```

목 동작 (모두 `src/api/` 안에서만):

- `requestTicket`은 호출할 때마다 번호를 돌려준다. 기본은 120부터 커지는 값이고, 개발 중 `?ticket=<n>`으로 시작 값을 바꿀 수 있다.
- `getQueueCursor`는 03이 열린 뒤 경과 시간에 비례해 올라간다. 기본은 초당 20이고, `?cursorPerSec=<n>`으로 바꿀 수 있다. 둘을 조절해 gap 구간별 폴링 간격을 확인한다.
- `getCoupons`는 DB 시드와 맞춰 10개를 돌려준다. 이름은 `PoC 쿠폰 1`~`PoC 쿠폰 10`, 설명은 `PoC 쿠폰입니다.`다. 이벤트당 쿠폰은 최대 10종이다.
- `claimCoupons`는 기본 `SUCCESS`이고 `?result=soldout`으로 `FAILED_SOLDOUT`을 돌려주게 바꿀 수 있다.

2단계에서 실제 호출을 넣을 때 지킬 규칙(1단계에서는 구현하지 않는다):

- 같은 호스트의 상대 경로만 쓴다. 절대 URL과 호스트 하드코딩 금지.
- 세션은 서버가 내려주는 HttpOnly 쿠키라서 JS는 세션 ID를 읽거나 저장하지 않는다.
- user_id를 요청 본문에 넣지 않는다. 서버가 세션에서 꺼낸다.
- `fetch`는 HTTP 오류(`res.ok`가 false)에서 예외를 던지지 않는다. 응답을 쓰기 전에 `res.ok`를 확인하고, 아니면 실패로 처리한다.

## 6. 폴링 (03 화면)

원본은 `docs/api/폴링_클라이언트_구현_스펙.md`다. 서버는 이벤트당 하나의 서빙 커서만 내려주고(모든 사용자에게 같은 값, CDN에서 짧게 캐시될 수 있음), 내 번호와의 비교와 다음 폴링 시점은 전부 클라이언트가 정한다.

**분기**

- `gap = myTicketNumber − cursor`
- `gap <= 0`: 폴링을 멈추고 04로 이동한다.
- `gap > 0`: 아래 표대로 다음 폴링까지 기다렸다가 다시 요청한다. 간격은 **응답마다 새로 계산**하고 이전 값을 재사용하지 않는다.

| gap | 다음 폴링 간격 |
| --- | --- |
| 10,000 초과 | 10초 |
| 1,000 초과 ~ 10,000 이하 | 5초 |
| 100 초과 ~ 1,000 이하 | 2초 |
| 100 이하 | 1초 |

경계 값은 스펙의 예시 코드와 같게 **초과(`>`)** 기준으로 구현한다. 원본 표는 경계(1,000과 100)가 겹쳐 보이므로 TODO(미정)로 남기고 확인을 요청한다.

**구현 방식**

- `setInterval`이 아니라, 응답마다 `setTimeout`을 다시 거는 재귀 방식으로 구현한다. 간격이 매번 바뀌기 때문이다.
- `src/hooks/useQueuePolling.ts`의 커스텀 훅 하나로 만든다. 간격 계산은 `computeDelay(gap)` 순수 함수로 분리해 단위 테스트가 가능하게 한다.
- 훅은 **`myTicketNumber`가 확정된 뒤에만** 시작한다. 번호가 아직 `null`이거나 `undefined`일 때 `gap`을 계산하면 `null − cursor`가 0 이하가 되어 곧바로 04로 이동해 버린다. 반드시 막는다.
- 언마운트 시 `clearTimeout`을 호출하고 취소 플래그로 이후 응답을 무시한다. 화면을 벗어난 뒤에도 폴링이 도는 일이 없어야 한다.
- 폴링 훅은 03에 들어온 뒤에만 동작한다.

**실패 처리**

- 요청이 실패하거나(`res.ok`가 false 포함) 예외가 나면 즉시 포기하지 않고 재시도한다. 스펙의 예시는 2초 후 재시도이며, 이 값은 설정 파일에 임시 상수로 둔다. 단 **4xx는 재시도하지 않고 바로 에러 UI**를 보여 준다(§5, 백엔드 확인). 예를 들어 404 `EVENT_NOT_FOUND`는 다시 보내도 같다.
- 연속 실패 횟수에 상한을 둔다. 스펙의 예시는 5회이고, 넘으면 에러 UI를 보여 준다. 에러 UI는 설계서에 없으므로 최소한의 문구만 두고 TODO(미정)로 남긴다.
- 지수 백오프와 지터를 쓸지는 팀 확인이 필요하다(스펙은 고정 간격). 지금은 스펙대로 구현하고 TODO(미정)로 남긴다.
- 탭이 백그라운드로 가면 브라우저가 타이머를 늦출 수 있다. 탭이 다시 보일 때 즉시 한 번 호출하는 처리는 스펙에 없으므로 구현하지 말고 TODO(미정)로만 남긴다.

## 7. 설정, 더미 데이터, 이벤트 식별

- 설정은 `src/config.ts` 한 곳에 모은다. 정해진 값은 **`jitterMaxMs = 1000`** 하나다. 폴링 실패 재시도 간격(2초)과 연속 실패 상한(5회)은 스펙의 예시 값이며 `// 임시: 미정` 주석을 단다.
- 이벤트 정보는 화면이 `getEventInfo`만 통해 읽는다. 개발용 더미(`?startsIn=` 때)는 `src/mocks/event.ts`에 둔다. 필드는 PoC DB 정의서의 `event` 테이블 컬럼에서 온 것이다.

```ts
type EventInfo = {
  eventId: number           // event.event_id (INT UNSIGNED, 시드는 1)
  name: string              // event.name
  startAt: string           // event.start_at. KST (아래 시간대 규칙)
  endAt: string             // event.end_at. KST
  bannerUrl: string         // event.banner_image_path. DB 시드 값은 빈 문자열
  returnUrl: string         // event.endpoint_url (테넌트 복귀 주소). DB 시드 값은 빈 문자열
}
```

쿠폰 목록은 `EventInfo`에 넣지 않는다. `getCoupons`로 받는다.

- **시간대**: DB의 `start_at`은 KST로 저장되고 시간대 정보가 없다. 프런트는 이 값을 항상 **KST(+09:00)로 해석**한다. 브라우저의 로컬 시간대로 파싱하지 않는다. 더미 값도 `+09:00`이 붙은 ISO 문자열로 둔다.
- DB 시드의 `start_at`(2026-09-29 10:00 KST)은 이미 지난 값이라 더미에 쓰지 않는다. 더미의 `startAt`은 실행 시점의 15초 뒤(`+09:00` 표기)이고 `?startsIn=<초>`로 바꿀 수 있다. 더미는 이 쿼리가 있을 때만 쓴다.
- 이벤트 id는 `src/lib/eventId.ts`에서 얻는다. 호스트의 첫 라벨은 해시값이라 event id로 쓰지 않는다(백엔드 확인). 세션 발급이 끝나면 서버가 `/?event=<id>`로 보내므로, 숫자 event id는 **`?event=<id>` 쿼리로만** 전달된다. 우선순위는 (1) `?event=<id>` 쿼리, (2) 설정의 기본값 1(DB 시드의 event_id, `// 임시`)이다. 화면을 이동할 때 쿼리를 그대로 넘겨야 id가 유지된다.
- 배너는 `public/`의 더미 이미지를 쓴다. 실제 DB 값은 빈 문자열일 수 있으므로 화면은 `bannerUrl`이 비어 있어도 깨지지 않아야 한다.

## 8. 지켜야 할 제약

- `localStorage`, `sessionStorage`, `document.cookie`, IndexedDB를 쓰지 않는다. 번호와 세션 정보를 브라우저에 저장하지 않는다.
- 호스트와 절대 URL을 코드에 박지 않는다.
- `/api/*`를 프런트 경로로 쓰지 않고, `base`를 설정하지 않고, 해시 라우팅을 쓰지 않는다.
- 서버 런타임이 필요한 기능을 쓰지 않는다.
- 랜덤 값(지터)과 현재 시각은 각각 한 곳(지터 사용처, `serverTime.ts`)에서만 만든다.
- 일시는 KST(+09:00)로 해석하고 브라우저의 로컬 시간대에 의존하지 않는다.
- 화면 문구는 화면설계서를 따른다. 설계서에 없는 안내 문구(예: "새로고침하면 순번이 초기화됩니다")는 넣지 말고 TODO로 남긴다. 예외로 에러 화면의 `error.code`별 문구는 팀이 정했고 `src/lib/errorNotice.ts`에 둔다.

## 9. 배포 조건 (CloudFront 검증을 위해)

- `npm run build`가 `dist/`를 만든다. JS와 CSS는 해시가 붙은 파일명이고, `index.html`만 해시가 없다.
- 이미지 자산의 경로 이름은 미정이라, 빌드 산출물의 폴더 이름이 겹치지 않게 Vite의 `build.assetsDir`를 `app-assets`로 설정한다.
- 진입점은 `index.html` 하나다. 새로고침 때의 403/404 복구는 CloudFront가 맡는다.
- `dist/`는 테넌트 콘텐츠 버킷으로 복사되어 `{event id}.{tenant id}.루트도메인/`의 루트에서 서빙된다.

## 10. 아직 정해지지 않은 것 (구현하지 말고 TODO로만)

- 에러 화면의 디자인(문구는 `src/lib/errorNotice.ts`에서 `error.code`별로 정했고 임시다). 이벤트 종료 코드가 생기면 문구를 추가한다
- 서버 시각 보정(`Date`/`Age` 헤더 사용 여부). `/info`가 연결됐으므로 이제 정할 수 있다
- `endAt`을 02에서 쓸지(종료됐으면 버튼 대신 "종료된 이벤트입니다"를 바로 보여 줄지). 지금은 쓰지 않아 종료 후에도 02 버튼이 활성화되고, 03에서 `EVENT_ENDED` 에러 문구가 나온다(백엔드는 프런트에 맡김)
- 폴링 재시도 간격을 늘리는 방식(백엔드 권장)
- `returnUrl`과 배너 주소는 `/info`로 오고 비어 있을 수 있다. 비어 있을 때의 동작은 확정(배너는 그리지 않고, `returnUrl`이 비면 모달에 안내 문구)
- 폴링 실패 시 재시도 정책의 확정 (고정 간격인지 지수 백오프와 지터인지), 에러 화면
- 카운트다운의 서버 시각 보정 방식
- 에러와 예외 화면 (시작 전 접근, 세션 없음·만료, 요청 제한, 네트워크 오류, 이벤트 종료)
- 04를 직접 열었을 때의 처리. 서버는 순서를 검증하지 않는다(PoC 결정)
- 모바일 대응 (화면설계서는 PC 기준)

## 11. 완료 조건

1. `npm run build`가 성공하고 `dist/`에 해시 JS와 CSS, `index.html`이 있다.
2. `npm run dev`에서 `?startsIn=<초>`(더미 이벤트 정보)로 02 → (지터) → 03 → 04 → 모달 → `returnUrl` 이동이 끝까지 이어진다.
3. `/queue`, `/issue`에서 새로고침해도 같은 화면이 열린다.
4. API 호출 함수가 `src/api/` 한 모듈에만 있고 화면 코드에 `fetch`나 `axios`가 없다.
5. 스토리지와 `document.cookie` 사용이 없다.
6. 폴링: gap이 0 이하가 되는 순간 폴링이 멈추고 04로 이동한다. `computeDelay`의 구간별 값이 위 표와 같다(단위 테스트). `?ticket=`과 `?cursorPerSec=`로 gap을 크게 만들어 간격이 구간별로 바뀌는 것을 Network 탭에서 확인할 수 있다.
7. 폴링: 03을 벗어나면 요청이 더 나가지 않고, 번호를 받기 전에는 시작하지 않으며, 요청이 실패해도 화면이 멈추거나 크래시하지 않는다.
8. 브라우저 시간대를 바꿔도(예: UTC) 카운트다운이 같다.
9. 미정 항목이 `TODO(미정): ...` 주석으로 남아 있다.

## 작업 방식

- 시작 전에 계획을 짧게 말하고, 이 지침과 다르게 하고 싶은 부분이 있으면 먼저 묻는다.
- 이 지침에 없는 결정을 해야 하면 임의로 정하지 말고 TODO로 남긴 뒤 결과에서 알린다.
