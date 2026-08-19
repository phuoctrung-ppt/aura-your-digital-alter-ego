#!/usr/bin/env bash
# Smoke T-M4-01 Personas + Sessions API against a running local API.
# Usage:
#   ./scripts/smoke-m4.sh                 # assumes API already on BASE_URL
#   ./scripts/smoke-m4.sh --boot          # boots API with local Postgres + temp JWT secrets
#
# Never prints raw tokens in full — only length / truncated prefix.
# Prerequisites: Postgres up; persona seed applied:
#   pnpm --filter @aura/api prisma:seed
#

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
BOOT=0
if [[ "${1:-}" == "--boot" ]]; then
  BOOT=1
fi

EMAIL="smoke-m4-$(date +%s)@example.com"
PASSWORD="SmokeTest1!"
EMAIL_B="smoke-m4b-$(date +%s)@example.com"
API_PID=""

cleanup() {
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [[ "$BOOT" -eq 1 ]]; then
  export DATABASE_URL="${DATABASE_URL:-postgresql://aura:aura@localhost:5433/aura}"
  export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"
  export JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-smoke-access-secret-do-not-use-prod-32b}"
  export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-smoke-refresh-secret-do-not-use-prod-32b}"
  export JWT_ACCESS_TTL_SEC="${JWT_ACCESS_TTL_SEC:-900}"
  export JWT_REFRESH_TTL_SEC="${JWT_REFRESH_TTL_SEC:-604800}"
  export PORT="${PORT:-3000}"
  export NODE_ENV=development

  (cd "$ROOT/apps/api" && pnpm run build) >/tmp/aura-smoke-m4-build.log 2>&1
  (cd "$ROOT/apps/api" && node dist/main.js) >/tmp/aura-smoke-m4-api.log 2>&1 &
  API_PID=$!

  echo "Waiting for API on $BASE_URL ..."
  for i in $(seq 1 40); do
    if curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$API_PID" 2>/dev/null; then
      echo "API exited early. Log:"
      tail -n 80 /tmp/aura-smoke-m4-api.log || true
      exit 1
    fi
    sleep 0.5
  done
  curl -sf "$BASE_URL/health" >/dev/null
  echo "API up."
fi

json_field() {
  python3 -c "
import json,sys
obj=json.loads(sys.argv[1])
path=sys.argv[2].split('.')
cur=obj
for p in path:
  if not isinstance(cur, dict):
    cur=None
    break
  cur=cur.get(p)
if isinstance(cur, (dict, list)):
  print(json.dumps(cur))
elif cur is None:
  print('null')
elif isinstance(cur, bool):
  print('true' if cur else 'false')
else:
  print(cur)
" "$1" "$2"
}

assert_eq() {
  local label="$1" got="$2" want="$3"
  if [[ "$got" != "$want" ]]; then
    echo "FAIL $label: got='$got' want='$want'"
    exit 1
  fi
  echo "OK   $label"
}

echo "== register user A =="
REG_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"locale\":\"vi\"}")
REG_CODE=$(printf '%s' "$REG_BODY" | tail -n1)
REG_JSON=$(printf '%s' "$REG_BODY" | sed '$d')
assert_eq "register A status" "$REG_CODE" "201"
ACCESS=$(json_field "$REG_JSON" "data.tokens.accessToken")
USER_A=$(json_field "$REG_JSON" "data.user.id")
[[ -n "$ACCESS" && "$ACCESS" != "null" ]] || { echo "FAIL missing access"; exit 1; }

echo "== personas without token → 401 =="
P0_BODY=$(curl -sS -w "\n%{http_code}" "$BASE_URL/v1/personas")
P0_CODE=$(printf '%s' "$P0_BODY" | tail -n1)
P0_JSON=$(printf '%s' "$P0_BODY" | sed '$d')
assert_eq "personas unauth status" "$P0_CODE" "401"
assert_eq "personas unauth code" "$(json_field "$P0_JSON" "error.code")" "UNAUTHORIZED"

echo "== GET /v1/personas → exactly 2 =="
P1_BODY=$(curl -sS -w "\n%{http_code}" "$BASE_URL/v1/personas" \
  -H "Authorization: Bearer $ACCESS")
P1_CODE=$(printf '%s' "$P1_BODY" | tail -n1)
P1_JSON=$(printf '%s' "$P1_BODY" | sed '$d')
assert_eq "personas status" "$P1_CODE" "200"
assert_eq "personas error null" "$(json_field "$P1_JSON" "error")" "null"
ITEMS_LEN=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(len(d["data"]["items"]))' "$P1_JSON")
assert_eq "personas count" "$ITEMS_LEN" "2"
# Ensure no systemPromptText leak
if printf '%s' "$P1_JSON" | rg -q 'systemPromptText'; then
  echo "FAIL personas leaked systemPromptText"
  exit 1
fi
echo "OK   personas have no systemPromptText"

SLUGS=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(",".join(sorted(i["slug"] for i in d["data"]["items"])))' "$P1_JSON")
assert_eq "persona slugs" "$SLUGS" "native-buddy,tough-interviewer"

echo "== create session =="
CS_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/sessions" \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{"personaSlug":"tough-interviewer","locale":"vi"}')
CS_CODE=$(printf '%s' "$CS_BODY" | tail -n1)
CS_JSON=$(printf '%s' "$CS_BODY" | sed '$d')
# Accept 200 or 201
if [[ "$CS_CODE" != "200" && "$CS_CODE" != "201" ]]; then
  echo "FAIL create session status: $CS_CODE body=$CS_JSON"
  exit 1
fi
echo "OK   create session status=$CS_CODE"
SESSION_ID=$(json_field "$CS_JSON" "data.id")
assert_eq "session status open" "$(json_field "$CS_JSON" "data.status")" "open"
assert_eq "session persona" "$(json_field "$CS_JSON" "data.personaSlug")" "tough-interviewer"
assert_eq "session user" "$(json_field "$CS_JSON" "data.userId")" "$USER_A"
assert_eq "session endedAt null" "$(json_field "$CS_JSON" "data.endedAt")" "null"

echo "== list sessions includes created =="
LS_BODY=$(curl -sS -w "\n%{http_code}" "$BASE_URL/v1/sessions?status=open" \
  -H "Authorization: Bearer $ACCESS")
LS_CODE=$(printf '%s' "$LS_BODY" | tail -n1)
LS_JSON=$(printf '%s' "$LS_BODY" | sed '$d')
assert_eq "list status" "$LS_CODE" "200"
FOUND=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); sid=sys.argv[2]; print("yes" if any(i["id"]==sid for i in d["data"]["items"]) else "no")' "$LS_JSON" "$SESSION_ID")
assert_eq "list contains session" "$FOUND" "yes"

echo "== get session =="
GS_BODY=$(curl -sS -w "\n%{http_code}" "$BASE_URL/v1/sessions/$SESSION_ID" \
  -H "Authorization: Bearer $ACCESS")
GS_CODE=$(printf '%s' "$GS_BODY" | tail -n1)
GS_JSON=$(printf '%s' "$GS_BODY" | sed '$d')
assert_eq "get status" "$GS_CODE" "200"
assert_eq "get id" "$(json_field "$GS_JSON" "data.id")" "$SESSION_ID"

echo "== end session =="
ES_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/sessions/$SESSION_ID/end" \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{}')
ES_CODE=$(printf '%s' "$ES_BODY" | tail -n1)
ES_JSON=$(printf '%s' "$ES_BODY" | sed '$d')
assert_eq "end status" "$ES_CODE" "200"
assert_eq "ended status" "$(json_field "$ES_JSON" "data.status")" "ended"
ENDED_AT=$(json_field "$ES_JSON" "data.endedAt")
[[ "$ENDED_AT" != "null" && -n "$ENDED_AT" ]] || { echo "FAIL endedAt missing"; exit 1; }
echo "OK   endedAt set"

echo "== end session idempotent =="
ES2_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/sessions/$SESSION_ID/end" \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{}')
ES2_CODE=$(printf '%s' "$ES2_BODY" | tail -n1)
assert_eq "re-end status" "$ES2_CODE" "200"

echo "== register user B =="
REG_B=$(curl -sS -X POST "$BASE_URL/v1/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL_B\",\"password\":\"$PASSWORD\",\"locale\":\"vi\"}")
ACCESS_B=$(json_field "$REG_B" "data.tokens.accessToken")

echo "== cross-user get → 404 SESSION_NOT_FOUND =="
XU_BODY=$(curl -sS -w "\n%{http_code}" "$BASE_URL/v1/sessions/$SESSION_ID" \
  -H "Authorization: Bearer $ACCESS_B")
XU_CODE=$(printf '%s' "$XU_BODY" | tail -n1)
XU_JSON=$(printf '%s' "$XU_BODY" | sed '$d')
assert_eq "cross-user status" "$XU_CODE" "404"
assert_eq "cross-user code" "$(json_field "$XU_JSON" "error.code")" "SESSION_NOT_FOUND"

echo "== unknown session → 404 SESSION_NOT_FOUND =="
FAKE="00000000-0000-4000-8000-000000000099"
UNK_BODY=$(curl -sS -w "\n%{http_code}" "$BASE_URL/v1/sessions/$FAKE" \
  -H "Authorization: Bearer $ACCESS")
UNK_CODE=$(printf '%s' "$UNK_BODY" | tail -n1)
UNK_JSON=$(printf '%s' "$UNK_BODY" | sed '$d')
assert_eq "unknown status" "$UNK_CODE" "404"
assert_eq "unknown code" "$(json_field "$UNK_JSON" "error.code")" "SESSION_NOT_FOUND"

echo
echo "All M4 personas/sessions smoke checks passed for $EMAIL"
