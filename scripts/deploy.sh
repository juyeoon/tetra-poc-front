#!/usr/bin/env bash
# 빌드 산출물(dist/)을 CloudFront(multi-tenant)가 읽는 S3 버킷에 올린다. 빌드는 하지 않는다.
#
# 업로드 경로: s3://${BUCKET}/events/live/${EVENT_ID}/
# 순서: ASSETS_DIR의 해시 파일 -> 루트의 index.html 이외 파일 -> 마지막에 index.html
# 하지 않는 것: 삭제, ACL 지정, CloudFront 무효화. 이전 해시 파일은 그대로 둔다
#   (엣지에 최대 60초 남은 옛 index.html이 옛 해시 파일을 가리킬 수 있기 때문이다).
set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat >&2 <<'EOF'
사용법:
  BUCKET=<버킷> EVENT_ID=<숫자> [AWS_PROFILE=<프로필>] [DIST_DIR=dist] [ASSETS_DIR=<폴더>] [DRY_RUN=1] \
    bash scripts/deploy.sh      (또는 npm run deploy)

  BUCKET      업로드 버킷 (필수)
  EVENT_ID    숫자만 허용. 업로드 경로는 events/live/<EVENT_ID>/ (필수)
  AWS_PROFILE AWS CLI 프로필 (선택)
  DIST_DIR    빌드 산출물 폴더. 기본 dist (먼저 npm run build)
  ASSETS_DIR  해시 파일 폴더 이름. 기본은 vite.config.ts의 build.assetsDir (없으면 assets)
  DRY_RUN     1이면 aws 명령을 실행하지 않고 출력만 한다. 검사는 그대로 한다

예:
  BUCKET=tetra-storage-poc-poctenant001 EVENT_ID=1 AWS_PROFILE=tetraJyp DRY_RUN=1 npm run deploy
EOF
}

die_usage() {
  echo "오류: $1" >&2
  echo >&2
  usage
  exit 1
}

# --- 입력 -------------------------------------------------------------------

BUCKET="${BUCKET:-}"
EVENT_ID="${EVENT_ID:-}"
DIST_DIR="${DIST_DIR:-dist}"
DRY_RUN="${DRY_RUN:-0}"

[ -n "$BUCKET" ] || die_usage "BUCKET이 필요합니다."
[ -n "$EVENT_ID" ] || die_usage "EVENT_ID가 필요합니다."
[[ "$EVENT_ID" =~ ^[0-9]+$ ]] || die_usage "EVENT_ID는 숫자만 허용합니다. (입력값: $EVENT_ID)"
# 경로를 오염시킬 수 있는 문자를 막는다. S3 버킷 이름 규칙(소문자, 숫자, 하이픈, 점).
[[ "$BUCKET" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ]] || die_usage "BUCKET 형식이 올바르지 않습니다. (입력값: $BUCKET)"

# vite.config.ts의 build.assetsDir 값을 읽는다. 없으면 Vite 기본값 assets.
default_assets_dir() {
  local found=""
  if [ -f vite.config.ts ]; then
    found="$(sed -nE "s/^[[:space:]]*assetsDir:[[:space:]]*['\"]([^'\"]+)['\"].*/\1/p" vite.config.ts | head -n 1)"
  fi
  echo "${found:-assets}"
}
ASSETS_DIR="${ASSETS_DIR:-$(default_assets_dir)}"
[[ "$ASSETS_DIR" =~ ^[A-Za-z0-9._-]+$ ]] || die_usage "ASSETS_DIR는 [A-Za-z0-9._-]만 쓸 수 있습니다. (입력값: $ASSETS_DIR)"

DIST_DIR="${DIST_DIR%/}"
if [ ! -d "$DIST_DIR" ]; then
  echo "오류: ${DIST_DIR}/ 폴더가 없습니다. 먼저 빌드하세요: npm run build" >&2
  exit 1
fi

PREFIX="events/live/${EVENT_ID}/"

# --- 파일 목록 --------------------------------------------------------------

ALL_FILES=()
while IFS= read -r f; do
  ALL_FILES+=("${f#"$DIST_DIR"/}")
done < <(find "$DIST_DIR" -type f | LC_ALL=C sort)

if [ "${#ALL_FILES[@]}" -eq 0 ]; then
  echo "오류: ${DIST_DIR}/ 에 파일이 없습니다. 먼저 빌드하세요: npm run build" >&2
  exit 1
fi

# --- Content-Type -----------------------------------------------------------

# 이 표에 없는 확장자는 표에 추가하지 말고 팀에 물어본다. (배포 스크립트 지침)
content_type() {
  local ext
  ext="$(printf '%s' "${1##*.}" | tr '[:upper:]' '[:lower:]')"
  case "$ext" in
    html) echo 'text/html; charset=utf-8' ;;
    js | mjs) echo 'text/javascript; charset=utf-8' ;;
    css) echo 'text/css; charset=utf-8' ;;
    json) echo 'application/json; charset=utf-8' ;;
    txt) echo 'text/plain; charset=utf-8' ;;
    svg) echo 'image/svg+xml' ;;
    png) echo 'image/png' ;;
    jpg | jpeg) echo 'image/jpeg' ;;
    webp) echo 'image/webp' ;;
    gif) echo 'image/gif' ;;
    ico) echo 'image/x-icon' ;;
    woff2) echo 'font/woff2' ;;
    woff) echo 'font/woff' ;;
    webmanifest) echo 'application/manifest+json' ;;
    *) return 1 ;;
  esac
}

# --- 업로드 전 검사 ---------------------------------------------------------
# 하나라도 실패하면 아무것도 올리지 않고 종료한다. 실패는 모아서 한 번에 보여 준다.

ERRORS=()
fail() { ERRORS+=("$1"); }

# 해시 파일 이름 패턴: <이름>-<해시>.<확장자>
# Vite 8의 해시는 정확히 8자의 base64url 문자([A-Za-z0-9_-])이고, 해시 안에 '-'나 '_'가 들어갈 수 있다.
# 실제 산출물 예: index-D-oLPRPx.js, index-Dj4HMnHO.css
# 한계: 해시 없는 파일도 이름의 마지막 부분이 우연히 8자면(예: my-longname.js) 통과한다.
HASHED_NAME_RE='^.+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$'

# 1. index.html은 루트에 있고, 하위 폴더에는 없다
[ -f "${DIST_DIR}/index.html" ] || fail "1. ${DIST_DIR}/index.html이 없습니다."
for rel in "${ALL_FILES[@]}"; do
  if [ "$(basename "$rel")" = "index.html" ] && [ "$rel" != "index.html" ]; then
    fail "1. 하위 폴더에 index.html이 있습니다: $rel (루트에 하나만 허용)"
  fi
done

for rel in "${ALL_FILES[@]}"; do
  base="$(basename "$rel")"

  # 2. 소스맵 없음
  case "$base" in
    *.map) fail "2. 소스맵 파일이 있습니다: $rel (올리면 원본 코드가 공개됩니다)" ;;
  esac

  # 3. event.json 없음
  if [ "$base" = "event.json" ]; then
    fail "3. event.json이 있습니다: $rel (이벤트 정보의 원본은 /info API입니다)"
  fi

  # 4. 파일은 ASSETS_DIR/ 아래이거나 루트에만 있다
  case "$rel" in
    */*)
      case "$rel" in
        "${ASSETS_DIR}"/*) ;;
        *) fail "4. 허용하지 않는 폴더의 파일입니다: $rel (${ASSETS_DIR}/ 아래 또는 루트만 허용)" ;;
      esac
      ;;
  esac

  # 5. ASSETS_DIR 아래 파일은 이름에 해시가 있다
  case "$rel" in
    "${ASSETS_DIR}"/*)
      if ! [[ "$base" =~ $HASHED_NAME_RE ]]; then
        fail "5. ${ASSETS_DIR}/ 아래 파일 이름에 해시가 없습니다: $rel (예: name-AbC123xy.js). 1년 캐시(immutable)라 해시가 없으면 바뀐 내용이 사용자에게 가지 않습니다."
      fi
      ;;
  esac

  # 6. 파일 이름은 [A-Za-z0-9._-]만 쓴다 (경로 구분자 '/' 제외)
  if ! [[ "$rel" =~ ^[A-Za-z0-9._/-]+$ ]]; then
    fail "6. 파일 이름에 허용하지 않는 문자가 있습니다: $rel ([A-Za-z0-9._-]만 허용)"
  fi

  # 8. 확장자는 Content-Type 표에 있다
  if ! content_type "$base" >/dev/null; then
    fail "8. Content-Type 표에 없는 확장자입니다: $rel (표에 추가하지 말고 팀에 확인하세요)"
  fi
done

# 7. index.html의 src, href가 ASSETS_DIR를 절대 경로(/${ASSETS_DIR}/...)로 가리킨다
if [ -f "${DIST_DIR}/index.html" ]; then
  while IFS= read -r ref; do
    case "$ref" in
      "/${ASSETS_DIR}/"*) ;;
      *"${ASSETS_DIR}/"*)
        fail "7. index.html이 ${ASSETS_DIR}를 상대 경로로 가리킵니다: $ref (/${ASSETS_DIR}/... 절대 경로여야 합니다. /queue 같은 하위 경로에서 새로고침하면 403이 납니다)"
        ;;
    esac
  done < <(grep -oE '(src|href)="[^"]*"' "${DIST_DIR}/index.html" | sed -E 's/^(src|href)="(.*)"$/\2/')
fi

if [ "${#ERRORS[@]}" -gt 0 ]; then
  echo "업로드 전 검사에 실패했습니다. 아무것도 올리지 않았습니다." >&2
  for e in "${ERRORS[@]}"; do
    echo "  - $e" >&2
  done
  exit 2
fi

# --- build 값 ---------------------------------------------------------------

BUILD="unknown"
if command -v git >/dev/null 2>&1 && git rev-parse --verify HEAD >/dev/null 2>&1; then
  short="$(git rev-parse --short HEAD)"
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    BUILD="${short}-dirty"
    echo "경고: 커밋하지 않은 변경이 있습니다. build=${BUILD}" >&2
  else
    BUILD="$short"
  fi
else
  echo "경고: git 커밋 정보를 얻을 수 없습니다. build=unknown" >&2
fi

# --- 업로드 계획 ------------------------------------------------------------

ASSET_CACHE='public, max-age=31536000, immutable'
SHORT_CACHE='public, max-age=0, s-maxage=60'

PLAN_REL=()
PLAN_CACHE=()
add_plan() {
  PLAN_REL+=("$1")
  PLAN_CACHE+=("$2")
}

# 1. ASSETS_DIR의 해시 파일
for rel in "${ALL_FILES[@]}"; do
  case "$rel" in "${ASSETS_DIR}"/*) add_plan "$rel" "$ASSET_CACHE" ;; esac
done
# 2. 루트의 index.html 이외 파일
for rel in "${ALL_FILES[@]}"; do
  case "$rel" in */*) ;; index.html) ;; *) add_plan "$rel" "$SHORT_CACHE" ;; esac
done
# 3. 마지막에 index.html
add_plan "index.html" "$SHORT_CACHE"

echo "BUCKET     : ${BUCKET}"
echo "PREFIX     : ${PREFIX}"
echo "ASSETS_DIR : ${ASSETS_DIR}"
echo "build      : ${BUILD}"
echo "파일 수    : ${#PLAN_REL[@]}"
if [ "$DRY_RUN" = "1" ]; then
  echo "모드       : DRY_RUN (aws 명령을 실행하지 않고 출력만 합니다)"
fi
echo

AWS_ARGS=()
if [ -n "${AWS_PROFILE:-}" ]; then
  AWS_ARGS=(--profile "$AWS_PROFILE")
fi

if [ "$DRY_RUN" != "1" ] && ! command -v aws >/dev/null 2>&1; then
  echo "오류: aws CLI를 찾을 수 없습니다. AWS CLI v2를 설치하세요." >&2
  exit 1
fi

# --- 업로드 -----------------------------------------------------------------

SECONDS=0
for i in "${!PLAN_REL[@]}"; do
  rel="${PLAN_REL[$i]}"
  cache="${PLAN_CACHE[$i]}"
  ctype="$(content_type "$rel")"
  cmd=(aws ${AWS_ARGS[@]+"${AWS_ARGS[@]}"} s3 cp "${DIST_DIR}/${rel}" "s3://${BUCKET}/${PREFIX}${rel}"
    --content-type "$ctype" --cache-control "$cache" --metadata "build=${BUILD}")
  if [ "$DRY_RUN" = "1" ]; then
    printf 'DRY_RUN:'
    printf ' %q' "${cmd[@]}"
    printf '\n'
  else
    "${cmd[@]}"
  fi
done

# --- 결과 -------------------------------------------------------------------

echo
if [ "$DRY_RUN" = "1" ]; then
  echo "올릴 목록 (DRY_RUN이라 실제로 올리지 않았습니다)"
else
  echo "올린 목록"
fi
printf '%-60s  %-32s  %s\n' "키" "Content-Type" "Cache-Control"
for i in "${!PLAN_REL[@]}"; do
  rel="${PLAN_REL[$i]}"
  printf '%-60s  %-32s  %s\n' "${PREFIX}${rel}" "$(content_type "$rel")" "${PLAN_CACHE[$i]}"
done
echo
echo "소요 시간: ${SECONDS}초"
