#!/usr/bin/env bash
# Smoke T-M9-01 history wipe + memory emptiness against a local API.
# Usage:
#   ./scripts/smoke-m9.sh                 # assumes API already on BASE_URL
#   ./scripts/smoke-m9.sh --boot          # boots API with local Postgres + fake AI providers
#
# Flow: register A → session → multipart fake turn → seed MemoryItem via Prisma →
#       DELETE /v1/me/history → assert counts + empty sessions/memory.
# Optional cross-user: register B with session + memory, confirm untouched after A's wipe.
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

STAMP="$(date +%s)"
EMAIL_A="smoke-m9-a-${STAMP}@example.com"
EMAIL_B="smoke-m9-b-${STAMP}@example.com"
PASSWORD="SmokeTest1!"
API_PID=""
CLIENT_TURN_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
AUDIO_DIR="${AUDIO_STORAGE_PATH:-/tmp/aura-audio-smoke-m9}"

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
  export AUDIO_STORAGE_PATH="$AUDIO_DIR"
  mkdir -p "$AUDIO_STORAGE_PATH"

  (cd "$ROOT/apps/api" && pnpm run build) >/tmp/aura-smoke-m9-build.log 2>&1
  (cd "$ROOT/apps/api" && node dist/main.js) >/tmp/aura-smoke-m9-api.log 2>&1 &
  API_PID=$!

  echo "Waiting for API on $BASE_URL (AI_PROVIDER_MODE=${AI_PROVIDER_MODE}) ..."
  for _ in $(seq 1 40); do
    if curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$API_PID" 2>/dev/null; then
      echo "API exited early. Log:"
      tail -n 120 /tmp/aura-smoke-m9-api.log || true
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
    echo "FAIL $label: got='$got' want='$want'" >&2
    exit 1
  fi
  echo "OK   $label" >&2
}

assert_ge() {
  local label="$1" got="$2" want="$3"
  if [[ "$got" -lt "$want" ]]; then
    echo "FAIL $label: got='$got' want>='$want'" >&2
    exit 1
  fi
  echo "OK   $label (>= $want)" >&2
}

# Minimal WAV fixture (silent) — MIME audio/wav accepted by SP-3.
python3 - <<'PY'
import wave, struct, pathlib
path = pathlib.Path('/tmp/aura-smoke-m9.wav')
with wave.open(str(path), 'w') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(8000)
    frames = b''.join(struct.pack('<h', 0) for _ in range(800))  # 0.1s
    w.writeframes(frames)
print(path)
PY

seed_memory() {
  local user_id="$1" fact="$2"
  # Prefer package Prisma client against the same DATABASE_URL the API uses.
  (
    cd "$ROOT/apps/api"
    USER_ID="$user_id" FACT="$fact" \
    DATABASE_URL="${DATABASE_URL:-postgresql://aura:aura@localhost:5433/aura}" \
    DIRECT_URL="${DIRECT_URL:-${DATABASE_URL:-postgresql://aura:aura@localhost:5433/aura}}" \
    node --input-type=module <<'EOF'
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const userId = process.env.USER_ID;
const fact = process.env.FACT;
if (!userId || !fact) {
  throw new Error("USER_ID and FACT env required");
}
await prisma.memoryItem.create({
  data: {
    userId,
    fact,
    salience: 0.7,
    active: true,
  },
});
await prisma.$disconnect();
EOF
  )
}

register_user() {
  local email="$1"
  local body code json access user_id
  body=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\",\"locale\":\"vi\"}")
  code=$(printf '%s' "$body" | tail -n1)
  json=$(printf '%s' "$body" | sed '$d')
  assert_eq "register $email status" "$code" "201"
  access=$(json_field "$json" "data.tokens.accessToken")
  user_id=$(json_field "$json" "data.user.id")
  [[ -n "$access" && "$access" != "null" ]] || { echo "FAIL missing access for $email" >&2; exit 1; }
  [[ -n "$user_id" && "$user_id" != "null" ]] || { echo "FAIL missing userId for $email" >&2; exit 1; }
  # stdout is capture-only (access\nuserId); diagnostics go to stderr via assert_eq.
  printf '%s\n%s\n' "$access" "$user_id"
}

create_session() {
  local access="$1"
  local body code json session_id
  body=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/sessions" \
    -H "Authorization: Bearer $access" \
    -H 'Content-Type: application/json' \
    -d '{"personaSlug":"tough-interviewer","locale":"vi"}')
  code=$(printf '%s' "$body" | tail -n1)
  json=$(printf '%s' "$body" | sed '$d')
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    echo "FAIL create session status=$code body=$json" >&2
    exit 1
  fi
  session_id=$(json_field "$json" "data.id")
  [[ -n "$session_id" && "$session_id" != "null" ]] || { echo "FAIL sessionId" >&2; exit 1; }
  printf '%s\n' "$session_id"
}

echo "== register user A =="
mapfile -t A_CREDS < <(register_user "$EMAIL_A")
ACCESS_A="${A_CREDS[0]}"
USER_A="${A_CREDS[1]}"
echo "OK   userA=$USER_A"

echo "== register user B (cross-user control) =="
mapfile -t B_CREDS < <(register_user "$EMAIL_B")
ACCESS_B="${B_CREDS[0]}"
USER_B="${B_CREDS[1]}"
echo "OK   userB=$USER_B"

echo "== create sessions =="
SESSION_A="$(create_session "$ACCESS_A")"
SESSION_B="$(create_session "$ACCESS_B")"
echo "OK   sessionA=$SESSION_A sessionB=$SESSION_B"

echo "== POST turn for A (multipart + fake providers) =="
TURN_BODY=$(curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/v1/sessions/$SESSION_A/turns" \
  -H "Authorization: Bearer $ACCESS_A" \
  -F "audio=@/tmp/aura-smoke-m9.wav;type=audio/wav" \
  -F "clientLocale=vi" \
  -F "clientTurnId=$CLIENT_TURN_ID" \
  -F "clientDurationMs=1000")
TURN_CODE=$(printf '%s' "$TURN_BODY" | tail -n1)
TURN_JSON=$(printf '%s' "$TURN_BODY" | sed '$d')
if [[ "$TURN_CODE" != "200" ]]; then
  echo "FAIL turn status=$TURN_CODE body=$TURN_JSON"
  tail -n 80 /tmp/aura-smoke-m9-api.log 2>/dev/null || true
  exit 1
fi
assert_eq "turn error null" "$(json_field "$TURN_JSON" "error")" "null"
TURN_ID=$(json_field "$TURN_JSON" "data.turnId")
[[ "$TURN_ID" != "null" && -n "$TURN_ID" ]] || { echo "FAIL turnId"; exit 1; }
echo "OK   turnId=$TURN_ID"

echo "== seed MemoryItem for A + B via Prisma =="
seed_memory "$USER_A" "Smoke M9 fact for user A company Acme"
seed_memory "$USER_B" "Smoke M9 fact for user B company Beta"
echo "OK   memory seeded"

echo "== GET sessions A before wipe (expect turnCount) =="
LIST_BEFORE=$(curl -sS -w "\n%{http_code}" "$BASE_URL/v1/sessions" \
  -H "Authorization: Bearer $ACCESS_A")
LIST_BEFORE_CODE=$(printf '%s' "$LIST_BEFORE" | tail -n1)
LIST_BEFORE_JSON=$(printf '%s' "$LIST_BEFORE" | sed '$d')
assert_eq "list before status" "$LIST_BEFORE_CODE" "200"
ITEMS_BEFORE=$(json_field "$LIST_BEFORE_JSON" "data.items")
SESSION_A="$SESSION_A" ITEMS_JSON="$ITEMS_BEFORE" python3 - <<'PY'
import json, os
items=json.loads(os.environ["ITEMS_JSON"])
sid=os.environ["SESSION_A"]
assert len(items) >= 1, items
row=next(i for i in items if i.get("id")==sid)
tc=row.get("turnCount")
assert isinstance(tc, int) and tc >= 1, row
print(f"OK   turnCount={tc}")
PY

echo "== GET memory A before wipe =="
MEM_BEFORE=$(curl -sS -w "\n%{http_code}" "$BASE_URL/v1/memory" \
  -H "Authorization: Bearer $ACCESS_A")
MEM_BEFORE_CODE=$(printf '%s' "$MEM_BEFORE" | tail -n1)
MEM_BEFORE_JSON=$(printf '%s' "$MEM_BEFORE" | sed '$d')
assert_eq "memory before status" "$MEM_BEFORE_CODE" "200"
MEM_BEFORE_ITEMS=$(json_field "$MEM_BEFORE_JSON" "data.items")
ITEMS_JSON="$MEM_BEFORE_ITEMS" python3 - <<'PY'
import json, os
items=json.loads(os.environ["ITEMS_JSON"])
assert len(items) >= 1, items
print(f"OK   memory items before={len(items)}")
PY

echo "== DELETE /v1/me/history for A =="
WIPE_BODY=$(curl -sS -w "\n%{http_code}" -X DELETE "$BASE_URL/v1/me/history" \
  -H "Authorization: Bearer $ACCESS_A")
WIPE_CODE=$(printf '%s' "$WIPE_BODY" | tail -n1)
WIPE_JSON=$(printf '%s' "$WIPE_BODY" | sed '$d')
assert_eq "wipe status" "$WIPE_CODE" "200"
assert_eq "wipe error null" "$(json_field "$WIPE_JSON" "error")" "null"
assert_eq "wipe ok" "$(json_field "$WIPE_JSON" "data.ok")" "true"
assert_ge "deletedSessions" "$(json_field "$WIPE_JSON" "data.deletedSessions")" "1"
assert_ge "deletedTurns" "$(json_field "$WIPE_JSON" "data.deletedTurns")" "1"
assert_ge "deletedMemoryItems" "$(json_field "$WIPE_JSON" "data.deletedMemoryItems")" "1"
echo "OK   wipe counts sessions=$(json_field "$WIPE_JSON" "data.deletedSessions") turns=$(json_field "$WIPE_JSON" "data.deletedTurns") memory=$(json_field "$WIPE_JSON" "data.deletedMemoryItems")"

echo "== GET sessions A after wipe (empty) =="
LIST_AFTER=$(curl -sS -w "\n%{http_code}" "$BASE_URL/v1/sessions" \
  -H "Authorization: Bearer $ACCESS_A")
LIST_AFTER_CODE=$(printf '%s' "$LIST_AFTER" | tail -n1)
LIST_AFTER_JSON=$(printf '%s' "$LIST_AFTER" | sed '$d')
assert_eq "list after status" "$LIST_AFTER_CODE" "200"
ITEMS_AFTER=$(json_field "$LIST_AFTER_JSON" "data.items")
ITEMS_JSON="$ITEMS_AFTER" python3 - <<'PY'
import json, os
items=json.loads(os.environ["ITEMS_JSON"])
assert items == [], items
print("OK   sessions empty")
PY

echo "== GET memory A after wipe (empty) =="
MEM_AFTER=$(curl -sS -w "\n%{http_code}" "$BASE_URL/v1/memory" \
  -H "Authorization: Bearer $ACCESS_A")
MEM_AFTER_CODE=$(printf '%s' "$MEM_AFTER" | tail -n1)
MEM_AFTER_JSON=$(printf '%s' "$MEM_AFTER" | sed '$d')
assert_eq "memory after status" "$MEM_AFTER_CODE" "200"
MEM_AFTER_ITEMS=$(json_field "$MEM_AFTER_JSON" "data.items")
ITEMS_JSON="$MEM_AFTER_ITEMS" python3 - <<'PY'
import json, os
items=json.loads(os.environ["ITEMS_JSON"])
assert items == [], items
print("OK   memory empty")
PY

echo "== cross-user: B still has session + memory =="
LIST_B=$(curl -sS -w "\n%{http_code}" "$BASE_URL/v1/sessions" \
  -H "Authorization: Bearer $ACCESS_B")
LIST_B_CODE=$(printf '%s' "$LIST_B" | tail -n1)
LIST_B_JSON=$(printf '%s' "$LIST_B" | sed '$d')
assert_eq "list B status" "$LIST_B_CODE" "200"
ITEMS_B=$(json_field "$LIST_B_JSON" "data.items")
SESSION_B="$SESSION_B" ITEMS_JSON="$ITEMS_B" python3 - <<'PY'
import json, os
items=json.loads(os.environ["ITEMS_JSON"])
sid=os.environ["SESSION_B"]
assert any(i.get("id")==sid for i in items), items
print("OK   user B session intact")
PY

MEM_B=$(curl -sS -w "\n%{http_code}" "$BASE_URL/v1/memory" \
  -H "Authorization: Bearer $ACCESS_B")
MEM_B_CODE=$(printf '%s' "$MEM_B" | tail -n1)
MEM_B_JSON=$(printf '%s' "$MEM_B" | sed '$d')
assert_eq "memory B status" "$MEM_B_CODE" "200"
MEM_B_ITEMS=$(json_field "$MEM_B_JSON" "data.items")
ITEMS_JSON="$MEM_B_ITEMS" python3 - <<'PY'
import json, os
items=json.loads(os.environ["ITEMS_JSON"])
assert len(items) >= 1, items
print(f"OK   user B memory intact count={len(items)}")
PY

# Best-effort audio dir check (force-rm may already have removed it).
if [[ -d "$AUDIO_DIR/$SESSION_A" ]]; then
  echo "WARN audio dir still present for sessionA=$SESSION_A (best-effort)"
else
  echo "OK   audio dir removed or never created for sessionA"
fi

echo
echo "All M9 history wipe smoke checks passed for $EMAIL_A (cross-user $EMAIL_B intact)"
