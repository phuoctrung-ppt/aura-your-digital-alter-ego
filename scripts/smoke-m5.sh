#!/usr/bin/env bash
# Smoke T-M5-01 / T-M5-02 AI orchestrator against a local API.
# Usage:
#   ./scripts/smoke-m5.sh                 # assumes API already on BASE_URL
#   ./scripts/smoke-m5.sh --boot          # boots API with local Postgres + fake AI providers
#
# Fake providers are the default so CI/local works without Whisper/Ollama.
# Optional: set AI_PROVIDER_MODE=real (and provider env) to probe live stack.
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

EMAIL="smoke-m5-$(date +%s)@example.com"
PASSWORD="SmokeTest1!"
API_PID=""
CLIENT_TURN_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"

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
  export AUDIO_STORAGE_PATH="${AUDIO_STORAGE_PATH:-/tmp/aura-audio-smoke-m5}"
  mkdir -p "$AUDIO_STORAGE_PATH"

  (cd "$ROOT/apps/api" && pnpm run build) >/tmp/aura-smoke-m5-build.log 2>&1
  (cd "$ROOT/apps/api" && node dist/main.js) >/tmp/aura-smoke-m5-api.log 2>&1 &
  API_PID=$!

  echo "Waiting for API on $BASE_URL (AI_PROVIDER_MODE=${AI_PROVIDER_MODE}) ..."
  for _ in $(seq 1 40); do
    if curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$API_PID" 2>/dev/null; then
      echo "API exited early. Log:"
      tail -n 120 /tmp/aura-smoke-m5-api.log || true
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
path = pathlib.Path('/tmp/aura-smoke-m5.wav')
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

echo "== create open session =="
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

echo "== POST turn (multipart + fake providers) =="
TURN_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/sessions/$SESSION_ID/turns" \
  -H "Authorization: Bearer $ACCESS" \
  -F "audio=@/tmp/aura-smoke-m5.wav;type=audio/wav" \
  -F "clientLocale=vi" \
  -F "clientTurnId=$CLIENT_TURN_ID" \
  -F "clientDurationMs=1000")
TURN_CODE=$(printf '%s' "$TURN_BODY" | tail -n1)
TURN_JSON=$(printf '%s' "$TURN_BODY" | sed '$d')
if [[ "$TURN_CODE" != "200" ]]; then
  echo "FAIL turn status=$TURN_CODE body=$TURN_JSON"
  tail -n 80 /tmp/aura-smoke-m5-api.log 2>/dev/null || true
  exit 1
fi
assert_eq "turn error null" "$(json_field "$TURN_JSON" "error")" "null"
TURN_ID=$(json_field "$TURN_JSON" "data.turnId")
USER_TX=$(json_field "$TURN_JSON" "data.userTranscript")
ASST=$(json_field "$TURN_JSON" "data.assistantText")
AUDIO_URL=$(json_field "$TURN_JSON" "data.audioUrl")
PROVIDER_STT=$(json_field "$TURN_JSON" "data.provider.stt")
PROVIDER_CHAT=$(json_field "$TURN_JSON" "data.provider.chat")
PROVIDER_TTS=$(json_field "$TURN_JSON" "data.provider.tts")
SAFETY=$(json_field "$TURN_JSON" "data.safetyMode")
[[ "$TURN_ID" != "null" && -n "$TURN_ID" ]] || { echo "FAIL turnId"; exit 1; }
[[ "$USER_TX" != "null" && -n "$USER_TX" ]] || { echo "FAIL userTranscript"; exit 1; }
[[ "$ASST" != "null" && -n "$ASST" ]] || { echo "FAIL assistantText"; exit 1; }
[[ "$AUDIO_URL" == *"/turns/"*"/audio" ]] || { echo "FAIL audioUrl=$AUDIO_URL"; exit 1; }
assert_eq "safetyMode" "$SAFETY" "normal"
echo "OK   providers stt=$PROVIDER_STT chat=$PROVIDER_CHAT tts=$PROVIDER_TTS"

echo "== idempotent replay same clientTurnId =="
TURN2_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/sessions/$SESSION_ID/turns" \
  -H "Authorization: Bearer $ACCESS" \
  -F "audio=@/tmp/aura-smoke-m5.wav;type=audio/wav" \
  -F "clientLocale=vi" \
  -F "clientTurnId=$CLIENT_TURN_ID")
TURN2_CODE=$(printf '%s' "$TURN2_BODY" | tail -n1)
TURN2_JSON=$(printf '%s' "$TURN2_BODY" | sed '$d')
assert_eq "idempotent status" "$TURN2_CODE" "200"
assert_eq "idempotent turnId" "$(json_field "$TURN2_JSON" "data.turnId")" "$TURN_ID"

echo "== GET turn audio =="
AUD_CODE=$(curl -sS -o /tmp/aura-smoke-m5-out.audio -w "%{http_code}" \
  -H "Authorization: Bearer $ACCESS" \
  "$BASE_URL$AUDIO_URL")
assert_eq "audio status" "$AUD_CODE" "200"
AUD_BYTES=$(wc -c </tmp/aura-smoke-m5-out.audio | tr -d ' ')
[[ "$AUD_BYTES" -gt 0 ]] || { echo "FAIL empty audio body"; exit 1; }
echo "OK   audio bytes=$AUD_BYTES"

echo "== GET /v1/memory =="
MEM_BODY=$(curl -sS -w "\n%{http_code}" "$BASE_URL/v1/memory" \
  -H "Authorization: Bearer $ACCESS")
MEM_CODE=$(printf '%s' "$MEM_BODY" | tail -n1)
MEM_JSON=$(printf '%s' "$MEM_BODY" | sed '$d')
assert_eq "memory status" "$MEM_CODE" "200"
assert_eq "memory error null" "$(json_field "$MEM_JSON" "error")" "null"

echo "== turn on ended session → SESSION_CLOSED =="
curl -sS -X POST "$BASE_URL/v1/sessions/$SESSION_ID/end" \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{}' >/dev/null
CLOSED_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/sessions/$SESSION_ID/turns" \
  -H "Authorization: Bearer $ACCESS" \
  -F "audio=@/tmp/aura-smoke-m5.wav;type=audio/wav")
CLOSED_CODE=$(printf '%s' "$CLOSED_BODY" | tail -n1)
CLOSED_JSON=$(printf '%s' "$CLOSED_BODY" | sed '$d')
assert_eq "closed status" "$CLOSED_CODE" "409"
assert_eq "closed code" "$(json_field "$CLOSED_JSON" "error.code")" "SESSION_CLOSED"

echo
echo "All M5 AI orchestrator smoke checks passed for $EMAIL"
