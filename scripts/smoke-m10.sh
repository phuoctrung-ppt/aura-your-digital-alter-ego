#!/usr/bin/env bash
# Smoke T-M10-01 Safety UX policy against a local API.
# Usage:
#   ./scripts/smoke-m10.sh                 # assumes API already on BASE_URL
#   ./scripts/smoke-m10.sh --boot          # boots API with local Postgres + fake AI
#
# Assertions (filled by security-worker / qa-worker):
#   - FAKE_STT_TRANSCRIPT crisis phrase → safetyMode=safe-listener
#   - provider.chat=safe-listener (Tough Interviewer prompt skipped)
#   - safetyResources non-empty
#   - idempotent replay preserves safetyMode + safetyResources
#   - SafetyEvent row persisted (optional prisma count)
#
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

EMAIL="smoke-m10-$(date +%s)@example.com"
PASSWORD="SmokeTest1!"
API_PID=""
CLIENT_TURN_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"

# VN crisis fixture — matches SafetyService /tự\s*sát/i (see crisis-phrases.ts)
# Must export BEFORE API process starts so FakeSttProvider child inherits it.
export FAKE_STT_TRANSCRIPT="${FAKE_STT_TRANSCRIPT:-Tôi muốn tự sát}"

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
  export AI_PROVIDER_MODE="${AI_PROVIDER_MODE:-fake}"
  export STT_PROVIDER="${STT_PROVIDER:-fake}"
  export TTS_PROVIDER="${TTS_PROVIDER:-fake}"
  export AUDIO_STORAGE_PATH="${AUDIO_STORAGE_PATH:-/tmp/aura-audio-smoke-m10}"
  mkdir -p "$AUDIO_STORAGE_PATH"

  (cd "$ROOT/apps/api" && pnpm run build) >/tmp/aura-smoke-m10-build.log 2>&1
  (cd "$ROOT/apps/api" && node dist/main.js) >/tmp/aura-smoke-m10-api.log 2>&1 &
  API_PID=$!

  echo "Waiting for API on $BASE_URL (AI_PROVIDER_MODE=${AI_PROVIDER_MODE} FAKE_STT set) ..."
  for _ in $(seq 1 40); do
    if curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$API_PID" 2>/dev/null; then
      echo "API exited early. Log:"
      tail -n 120 /tmp/aura-smoke-m10-api.log || true
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

# Minimal WAV fixture (silent) — MIME audio/wav accepted by SP-3.
python3 - <<'PY'
import wave, struct, pathlib
path = pathlib.Path('/tmp/aura-smoke-m10.wav')
with wave.open(str(path), 'w') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(8000)
    frames = b''.join(struct.pack('<h', 0) for _ in range(800))  # 0.1s
    w.writeframes(frames)
print(path)
PY

echo "== register =="
REG_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"locale\":\"vi\"}")
REG_CODE=$(printf '%s' "$REG_BODY" | tail -n1)
REG_JSON=$(printf '%s' "$REG_BODY" | sed '$d')
assert_eq "register status" "$REG_CODE" "201"
ACCESS=$(json_field "$REG_JSON" "data.tokens.accessToken")
[[ -n "$ACCESS" && "$ACCESS" != "null" ]] || { echo "FAIL missing access"; exit 1; }

echo "== create tough-interviewer session =="
CS_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/sessions" \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{"personaSlug":"tough-interviewer","locale":"vi"}')
CS_CODE=$(printf '%s' "$CS_BODY" | tail -n1)
CS_JSON=$(printf '%s' "$CS_BODY" | sed '$d')
if [[ "$CS_CODE" != "200" && "$CS_CODE" != "201" ]]; then
  echo "FAIL create session status=$CS_CODE body=$CS_JSON"
  exit 1
fi
SESSION_ID=$(json_field "$CS_JSON" "data.id")
echo "OK   sessionId=$SESSION_ID"

echo "== POST crisis turn (FAKE_STT_TRANSCRIPT → safe-listener) =="
TURN_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/sessions/$SESSION_ID/turns" \
  -H "Authorization: Bearer $ACCESS" \
  -F "audio=@/tmp/aura-smoke-m10.wav;type=audio/wav" \
  -F "clientLocale=vi" \
  -F "clientTurnId=$CLIENT_TURN_ID" \
  -F "clientDurationMs=1000")
TURN_CODE=$(printf '%s' "$TURN_BODY" | tail -n1)
TURN_JSON=$(printf '%s' "$TURN_BODY" | sed '$d')
if [[ "$TURN_CODE" != "200" ]]; then
  echo "FAIL turn status=$TURN_CODE body=$TURN_JSON"
  tail -n 80 /tmp/aura-smoke-m10-api.log 2>/dev/null || true
  exit 1
fi
assert_eq "turn error null" "$(json_field "$TURN_JSON" "error")" "null"
TURN_ID=$(json_field "$TURN_JSON" "data.turnId")
SAFETY=$(json_field "$TURN_JSON" "data.safetyMode")
PROVIDER_CHAT=$(json_field "$TURN_JSON" "data.provider.chat")
RESOURCES=$(json_field "$TURN_JSON" "data.safetyResources")
ASST=$(json_field "$TURN_JSON" "data.assistantText")

assert_eq "safetyMode" "$SAFETY" "safe-listener"
assert_eq "provider.chat" "$PROVIDER_CHAT" "safe-listener"
[[ "$RESOURCES" != "null" && "$RESOURCES" != "[]" && -n "$RESOURCES" ]] || {
  echo "FAIL safetyResources empty: $RESOURCES"
  exit 1
}
echo "OK   safetyResources present"
[[ "$ASST" != "null" && -n "$ASST" ]] || { echo "FAIL assistantText"; exit 1; }
echo "OK   assistantText (safe-listener reply; do not print body)"

echo "== idempotent replay preserves safetyMode + resources =="
TURN2_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/sessions/$SESSION_ID/turns" \
  -H "Authorization: Bearer $ACCESS" \
  -F "audio=@/tmp/aura-smoke-m10.wav;type=audio/wav" \
  -F "clientLocale=vi" \
  -F "clientTurnId=$CLIENT_TURN_ID")
TURN2_CODE=$(printf '%s' "$TURN2_BODY" | tail -n1)
TURN2_JSON=$(printf '%s' "$TURN2_BODY" | sed '$d')
assert_eq "idempotent status" "$TURN2_CODE" "200"
assert_eq "idempotent turnId" "$(json_field "$TURN2_JSON" "data.turnId")" "$TURN_ID"
assert_eq "idempotent safetyMode" "$(json_field "$TURN2_JSON" "data.safetyMode")" "safe-listener"
assert_eq "idempotent provider.chat" "$(json_field "$TURN2_JSON" "data.provider.chat")" "safe-listener"
RESOURCES2=$(json_field "$TURN2_JSON" "data.safetyResources")
[[ "$RESOURCES2" != "null" && "$RESOURCES2" != "[]" && -n "$RESOURCES2" ]] || {
  echo "FAIL idempotent safetyResources empty: $RESOURCES2"
  exit 1
}
echo "OK   idempotent safetyResources present"

echo "== SafetyEvent persisted (DB count) =="
EVENT_COUNT=$(
  SESSION_ID="$SESSION_ID" DATABASE_URL="${DATABASE_URL:-postgresql://aura:aura@localhost:5433/aura}" \
  python3 - <<'PY'
import os, re, shutil, subprocess
sid = os.environ["SESSION_ID"]
db = os.environ.get("DATABASE_URL", "postgresql://aura:aura@localhost:5433/aura")
if not shutil.which("psql"):
    print("skip")
elif not re.fullmatch(r"[0-9a-fA-F-]{36}", sid):
    print("bad-sid")
else:
    # sid validated as UUID — safe as a SQL string literal.
    sql = 'SELECT count(*) FROM safety_events WHERE "sessionId" = \'{0}\''.format(sid)
    out = subprocess.check_output(["psql", db, "-tAc", sql], text=True).strip()
    print(out or "0")
PY
)
if [[ "$EVENT_COUNT" == "skip" ]]; then
  echo "OK   SafetyEvent count skipped (no psql); response-shape asserted"
elif [[ "$EVENT_COUNT" =~ ^[0-9]+$ ]] && [[ "$EVENT_COUNT" -ge 1 ]]; then
  echo "OK   SafetyEvent count=$EVENT_COUNT"
else
  echo "FAIL SafetyEvent count=$EVENT_COUNT (want >=1)"
  exit 1
fi

echo
echo "All M10 safety smoke checks passed for $EMAIL"
