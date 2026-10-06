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
npm test         # 폴링(간격, 실패 15초 규칙), 응답 처리, 에러 화면 매핑 등 단위 테스트
npm run deploy   # dist/를 S3에 업로드 (아래 "배포" 참고)
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

- 5개(`getEventInfo`, `requestTicket`, `getQueueCursor`, `getCoupons`, `claimCoupons`) 모두 실제 `fetch`로 `/api/issuance/events/{eventId}/...`를 호출한다. 단 개발용으로 `?startsIn=<초>`가 있으면 `getEventInfo`는 더미를 돌려준다(카운트다운 확인용).

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
  - `?cursorFail=<n>` 또는 `?cursorFail=always` — n번째 호출마다, 또는 매번 잘못된 응답을 돌려준다(실패가 15초 이어지면 에러 UI 노출)
  - `?cursorPerSec=<n>` — 위 두 옵션이 쓸 가짜 커서의 초당 증가량(기본 20)

## 배포 (S3 업로드)

`scripts/deploy.sh`가 빌드 산출물(`dist/`)을 CloudFront(multi-tenant)가 읽는 S3 버킷에 올린다. **빌드는 하지 않으므로 먼저 `npm run build`를 한다.** AWS CLI v2가 필요하다.

```
npm run build

# 1) 먼저 DRY_RUN으로 검사와 올릴 명령을 확인한다 (aws를 실행하지 않는다)
BUCKET=tetra-storage-poc-poctenant001 EVENT_ID=1 AWS_PROFILE=tetraJyp DRY_RUN=1 npm run deploy

# 2) 결과를 보고 이상이 없으면 DRY_RUN 없이 직접 실행한다
BUCKET=tetra-storage-poc-poctenant001 EVENT_ID=1 AWS_PROFILE=tetraJyp npm run deploy
```

| 환경 변수 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `BUCKET` | 예 | 없음 | 업로드 버킷 |
| `EVENT_ID` | 예 | 없음 | 숫자만 허용. 업로드 경로는 `events/live/<EVENT_ID>/` |
| `AWS_PROFILE` | 아니오 | AWS CLI 기본 | |
| `DIST_DIR` | 아니오 | `dist` | |
| `ASSETS_DIR` | 아니오 | `vite.config.ts`의 `build.assetsDir`(`app-assets`) | 해시 파일 폴더 이름 |
| `DRY_RUN` | 아니오 | `0` | `1`이면 aws 명령을 실행하지 않고 출력만 |

- **업로드 전 검사**: 아래 중 하나라도 어긋나면 아무것도 올리지 않고 이유를 출력한 뒤 종료코드 2로 끝난다.
  `index.html`이 루트에 하나만 있다 / `.map` 없음 / `event.json` 없음 / 파일은 `app-assets/` 아래이거나 루트에만 있다 /
  `app-assets/` 아래 파일 이름에 해시가 있다 / 파일 이름이 `[A-Za-z0-9._-]`만 쓴다 /
  `index.html`이 `/app-assets/...` 절대 경로로 가리킨다 / 모든 확장자가 Content-Type 표에 있다.
- **업로드 순서와 Cache-Control**: `app-assets/`의 해시 파일(`public, max-age=31536000, immutable`) → 루트의 `index.html` 이외 파일 → 마지막에 `index.html`(둘 다 `public, max-age=0, s-maxage=60`). 모든 객체에 `--metadata build=<git 짧은 해시>`를 붙인다(커밋하지 않은 변경이 있으면 `-dirty`, git이 없으면 `unknown`).
- **하지 않는 것**: 삭제, ACL 지정, CloudFront 무효화, 다른 `EVENT_ID` 경로나 버킷 루트에 쓰기. 이전 해시 파일은 지우지 않는다(엣지에 최대 60초 남은 옛 `index.html`이 옛 해시 파일을 가리킬 수 있기 때문이다).
- **Windows**: `npm run deploy`는 PATH에서 처음 잡히는 `bash`를 쓴다. PowerShell이나 cmd에서는 `C:\Windows\System32\bash.exe`(WSL)가 먼저 잡혀 WSL 배포판이 없으면 `execvpe(/bin/bash) failed`로 실패할 수 있다. 이 경우 **Git Bash에서 실행**한다.
- 새 확장자(폰트 `.woff2` 등)가 생기면 스크립트의 Content-Type 표에 넣지 말고 팀에 먼저 확인한다.

## 현재 상태

- 1단계(스켈레톤): 완료. 화면/라우팅/빌드 설정, 폴링 훅.
- 2단계(실제 API 연결): 완료. 5개 API 모두 실제 `fetch`.
- 추가지침 01(서빙 커서 캐시 대응): 완료.
- 추가지침 02(CloudFront 실습 결과 반영: 폴링 15초 실패 규칙, 상태 코드별 에러 화면): 완료.
- S3 업로드 스크립트: 완료. 실제 업로드는 사람이 `DRY_RUN` 결과를 보고 직접 실행한다.
