#!/usr/bin/env bash
# Smoke T-M2-01 Auth API against a running local API.
# Usage:
#   ./scripts/smoke-auth.sh                 # assumes API already on BASE_URL
#   ./scripts/smoke-auth.sh --boot          # boots API with local Postgres + temp JWT secrets
#
# Never prints raw tokens in full — only length / truncated prefix.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
BOOT=0
if [[ "${1:-}" == "--boot" ]]; then
  BOOT=1
fi

EMAIL="smoke-$(date +%s)@example.com"
PASSWORD="SmokeTest1!"
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

  # Prefer built dist for a stable smoke boot.
  (cd "$ROOT/apps/api" && pnpm run build) >/tmp/aura-smoke-auth-build.log 2>&1
  (cd "$ROOT/apps/api" && node dist/main.js) >/tmp/aura-smoke-auth-api.log 2>&1 &
  API_PID=$!

  echo "Waiting for API on $BASE_URL ..."
  for i in $(seq 1 40); do
    if curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$API_PID" 2>/dev/null; then
      echo "API exited early. Log:"
      tail -n 80 /tmp/aura-smoke-auth-api.log || true
      exit 1
    fi
    sleep 0.5
  done
  curl -sf "$BASE_URL/health" >/dev/null
  echo "API up."
fi

json_field() {
  # usage: json_field <json> <dot.path>
  # Prints JSON-encoded scalar (null → null, true → true, strings unquoted for convenience).
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

echo "== register =="
REG_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"locale\":\"vi\"}")
REG_CODE=$(printf '%s' "$REG_BODY" | tail -n1)
REG_JSON=$(printf '%s' "$REG_BODY" | sed '$d')
assert_eq "register status" "$REG_CODE" "201"
assert_eq "register error null" "$(json_field "$REG_JSON" "error")" "null"
ACCESS=$(json_field "$REG_JSON" "data.tokens.accessToken")
REFRESH=$(json_field "$REG_JSON" "data.tokens.refreshToken")
EXPIRES=$(json_field "$REG_JSON" "data.tokens.expiresIn")
assert_eq "register expiresIn" "$EXPIRES" "900"
[[ -n "$ACCESS" && "$ACCESS" != "null" ]] || { echo "FAIL missing access"; exit 1; }
[[ -n "$REFRESH" && "$REFRESH" != "null" ]] || { echo "FAIL missing refresh"; exit 1; }
echo "OK   register tokens (access_len=${#ACCESS} refresh_len=${#REFRESH})"

echo "== me without token → 401 =="
ME0_BODY=$(curl -sS -w "\n%{http_code}" "$BASE_URL/v1/me")
ME0_CODE=$(printf '%s' "$ME0_BODY" | tail -n1)
ME0_JSON=$(printf '%s' "$ME0_BODY" | sed '$d')
assert_eq "me unauth status" "$ME0_CODE" "401"
assert_eq "me unauth code" "$(json_field "$ME0_JSON" "error.code")" "UNAUTHORIZED"

echo "== me with access → 200 =="
ME1_BODY=$(curl -sS -w "\n%{http_code}" "$BASE_URL/v1/me" \
  -H "Authorization: Bearer $ACCESS")
ME1_CODE=$(printf '%s' "$ME1_BODY" | tail -n1)
ME1_JSON=$(printf '%s' "$ME1_BODY" | sed '$d')
assert_eq "me auth status" "$ME1_CODE" "200"
assert_eq "me email" "$(json_field "$ME1_JSON" "data.email")" "$(echo "$EMAIL" | tr '[:upper:]' '[:lower:]')"

echo "== login =="
LOGIN_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
LOGIN_CODE=$(printf '%s' "$LOGIN_BODY" | tail -n1)
LOGIN_JSON=$(printf '%s' "$LOGIN_BODY" | sed '$d')
assert_eq "login status" "$LOGIN_CODE" "200"
ACCESS2=$(json_field "$LOGIN_JSON" "data.tokens.accessToken")
REFRESH2=$(json_field "$LOGIN_JSON" "data.tokens.refreshToken")
[[ -n "$ACCESS2" && "$ACCESS2" != "null" ]] || { echo "FAIL login access"; exit 1; }

echo "== refresh rotates =="
REF_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/auth/refresh" \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH2\"}")
REF_CODE=$(printf '%s' "$REF_BODY" | tail -n1)
REF_JSON=$(printf '%s' "$REF_BODY" | sed '$d')
assert_eq "refresh status" "$REF_CODE" "200"
REFRESH3=$(json_field "$REF_JSON" "data.tokens.refreshToken")
ACCESS3=$(json_field "$REF_JSON" "data.tokens.accessToken")
[[ "$REFRESH3" != "$REFRESH2" ]] || { echo "FAIL refresh did not rotate"; exit 1; }
echo "OK   refresh rotated"

echo "== old refresh reuse → REFRESH_REVOKED =="
REUSE_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/auth/refresh" \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH2\"}")
REUSE_CODE=$(printf '%s' "$REUSE_BODY" | tail -n1)
REUSE_JSON=$(printf '%s' "$REUSE_BODY" | sed '$d')
assert_eq "reuse status" "$REUSE_CODE" "401"
REUSE_ERR=$(json_field "$REUSE_JSON" "error.code")
if [[ "$REUSE_ERR" != "REFRESH_REVOKED" && "$REUSE_ERR" != "TOKEN_INVALID" ]]; then
  echo "FAIL reuse code: $REUSE_ERR"
  exit 1
fi
echo "OK   reuse error=$REUSE_ERR"

echo "== logout =="
# After reuse, all tokens may be revoked — login again for a clean logout check.
LOGIN2_JSON=$(curl -sS -X POST "$BASE_URL/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
ACCESS_L=$(json_field "$LOGIN2_JSON" "data.tokens.accessToken")
REFRESH_L=$(json_field "$LOGIN2_JSON" "data.tokens.refreshToken")
OUT_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/auth/logout" \
  -H "Authorization: Bearer $ACCESS_L" \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH_L\"}")
OUT_CODE=$(printf '%s' "$OUT_BODY" | tail -n1)
OUT_JSON=$(printf '%s' "$OUT_BODY" | sed '$d')
assert_eq "logout status" "$OUT_CODE" "200"
assert_eq "logout ok" "$(json_field "$OUT_JSON" "data.ok")" "true"

echo "== revoked refresh after logout → TOKEN_INVALID or REFRESH_REVOKED =="
AFTER_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/auth/refresh" \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH_L\"}")
AFTER_CODE=$(printf '%s' "$AFTER_BODY" | tail -n1)
AFTER_JSON=$(printf '%s' "$AFTER_BODY" | sed '$d')
assert_eq "post-logout refresh status" "$AFTER_CODE" "401"
AFTER_ERR=$(json_field "$AFTER_JSON" "error.code")
if [[ "$AFTER_ERR" != "REFRESH_REVOKED" && "$AFTER_ERR" != "TOKEN_INVALID" ]]; then
  echo "FAIL post-logout code: $AFTER_ERR"
  exit 1
fi
echo "OK   post-logout error=$AFTER_ERR"

echo
echo "All auth smoke checks passed for $EMAIL"
