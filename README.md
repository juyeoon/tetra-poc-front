# Tetra PoC — Issuance Service 프런트

멀티테넌트 선착순 쿠폰 발급 서비스의 PoC 프런트다. 목적은 두 가지다.

1. 백엔드가 트래픽을 얼마나 감당하는지 스펙을 측정한다.
2. CloudFront가 설계대로 동작하는지(경로 분기, 캐시, 새로고침 복구) 확인한다.

이 레포 자체는 부하를 만들지 않는다. CloudFront 동작을 확인하는 화면과, 부하 스크립트가 따라 할 브라우저 동작(지터, 폴링)의 기준 구현만 제공한다.

지침과 제약, 미정 항목의 전체 목록은 [CLAUDE.md](CLAUDE.md)를 본다. 서빙 커서 캐시 대응 추가 지침은 [CLAUDE_추가지침_01_커서캐시.md](CLAUDE_추가지침_01_커서캐시.md)에 있다. 이 문서는 요약이다.

## 실행

```
npm install
npm run dev      # 로컬 개발 서버
npm run build    # dist/ 정적 파일 생성
npm test         # computeDelay, mergeCursor, parseCursorResponse, eventId 파싱 단위 테스트
```

## 화면과 라우팅

| 화면 | 경로 | 내용 |
| --- | --- | --- |
| 02 대기방 | `/` | 카운트다운 → 버튼 활성화, 클릭 시 지터(0~`jitterMaxMs`) 후 이동 |
| 03 번호표 | `/queue` | 번호표 발급 + 서빙 커서 폴링, gap ≤ 0이면 04로 이동 |
| 04 쿠폰 발급 | `/issue` | 쿠폰 목록 + 전체 발급 버튼, 결과 모달(성공/품절) |

해시 라우팅은 쓰지 않는다(`BrowserRouter`). `base`도 설정하지 않는다 — 호스트 루트에 배포되기 때문이다.

## 배포 스택

| 영역 | 구성 |
| --- | --- |
| 프런트 | Vite + React + TS로 빌드한 정적 SPA. 서버 런타임 없음 |
| 프런트 호스팅 | S3(정적 파일) + CloudFront(CDN) |
| API | EKS pod, 앞단에 ALB. 경로는 `/api/issuance/...` |
| 라우팅 | CloudFront가 path 기반으로 분기: 기본(`/*`)은 S3, `/api/*`는 ALB(EKS) 오리진. 같은 origin처럼 동작해 CORS 없이 쿠키가 전달됨 |
| 캐싱 | `queue/cursor` 같은 전역·캐시 가능한 응답은 CloudFront에서 짧은 TTL로 캐싱 — 이게 PoC가 검증하려는 핵심 포인트 |
| DB | MySQL 8.0 (tenant/event/coupon/issuance_history 4개 테이블). 재고 실시간 차감은 Redis |

CloudFront behavior 설정, EKS Ingress 등 인프라 쪽 구성은 이 레포 범위 밖이다.

## API 연결 (2단계)

API 호출은 전부 `src/api/index.ts` 한 곳에 있다. 화면 코드는 `fetch`를 직접 쓰지 않는다.

- `getEventInfo`: API가 없어 계속 더미다 (이벤트명/배너/복귀주소는 PoC 전용 값).
- 나머지 4개(`requestTicket`, `getQueueCursor`, `getCoupons`, `claimCoupons`)는 실제 `fetch`로 `/api/issuance/events/{eventId}/...`를 호출한다.

로컬 개발 중 실제 백엔드에 붙여보려면 `.env.local`에 아래를 추가한다.

```
VITE_API_PROXY_TARGET=<EKS/ALB 주소>
```

`npm run dev`의 `/api/*` 요청이 그 주소로 프록시된다(dev 전용). 운영 배포에서는 이 역할을 CloudFront의 `/api/*` behavior가 대신한다.

## 서빙 커서 캐시 대응

`queue/cursor`는 CloudFront 엣지에서 캐시되므로, 엣지마다 갱신 시점이 달라 커서가 일시적으로 뒤로 갈 수 있다. 캐시를 깨뜨리지 않도록 이 요청에는 캐시 무효화 쿼리, `fetch`의 `cache` 옵션, 커스텀 헤더, `credentials` 옵션 변경을 하지 않는다. 자세한 배경은 [CLAUDE_추가지침_01_커서캐시.md](CLAUDE_추가지침_01_커서캐시.md)를 본다.

- `parseCursorResponse`(`src/api/parseCursorResponse.ts`): 응답이 올바른 `{ cursor: number }` 모양일 때만 통과시킨다. CloudFront 설정 오류로 `index.html`이 200으로 돌아오는 경우까지 걸러낸다.
- `mergeCursor`(`src/hooks/useQueuePolling.ts`): 지금까지 받은 커서의 최댓값만 쓰고, 작은 값(캐시 지연으로 인한 역행)은 무시한다.
- 로컬에서 실제 백엔드 없이 이 동작을 테스트하려면 `/queue`에 아래 쿼리를 쓴다.
  - `?cursorRegress=<n>` — n번째 호출마다 직전보다 작은 커서를 돌려준다(역행 흉내)
  - `?cursorFail=<n>` 또는 `?cursorFail=always` — n번째 호출마다, 또는 매번 잘못된 응답을 돌려준다(5회 연속이면 에러 UI 노출)
  - `?cursorPerSec=<n>` — 위 두 옵션이 쓸 가짜 커서의 초당 증가량(기본 20)

## 현재 상태

- 1단계(스켈레톤): 완료. 화면/라우팅/빌드 설정, 폴링 훅.
- 2단계(실제 API 연결): 완료. `getEventInfo`만 API가 없어 더미로 남아 있고, 나머지 4개는 실제 `fetch`. 응답 스키마가 아직 미정인 엔드포인트는 `src/api/index.ts`에 `TODO(미정)`으로 표시해 뒀다.
- 추가지침 01(서빙 커서 캐시 대응): 완료.
