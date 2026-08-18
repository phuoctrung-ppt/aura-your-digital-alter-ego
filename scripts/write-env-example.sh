#!/usr/bin/env bash
# Materialize root .env.example from docs/env.example.txt (AGENTS.md §13 names only).
# Safe to re-run; overwrites only the example file (never real .env).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ROOT}/docs/env.example.txt"
DST="${ROOT}/.env.example"

if [[ -f "${SRC}" ]]; then
  # Prefer docs template when present (strip meta line if any)
  grep -v 'Canonical copy lives' "${SRC}" > "${DST}"
else
  # Fallback inline §13 names (empty values)
  cat > "${DST}" <<'EOF'
# Aura — environment variable names (AGENTS.md §13)
# Copy to apps/api/.env and/or apps/mobile/.env as needed.
# Values are empty on purpose — never commit real secrets.
# Local defaults for DATABASE_URL / OLLAMA_* are documented in docker/README.md.

# ── API ──────────────────────────────────────────────────────────────────────
DATABASE_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
PORT=

# ── AI providers ─────────────────────────────────────────────────────────────
OLLAMA_BASE_URL=
OLLAMA_CHAT_MODEL=
LLM_FALLBACK_BASE_URL=
LLM_FALLBACK_API_KEY=
LLM_FALLBACK_CHAT_MODEL=
STT_PROVIDER=
WHISPER_BASE_URL=
TTS_PROVIDER=
TTS_BASE_URL=
TTS_API_KEY=

# ── Storage ──────────────────────────────────────────────────────────────────
AUDIO_STORAGE_PATH=
# S3_* later (not MVP)

# ── Mobile (public — safe to embed in client bundle) ─────────────────────────
EXPO_PUBLIC_API_URL=
EOF
fi

mkdir -p "${ROOT}/docker"
if [[ ! -f "${ROOT}/docker/.env.example" ]]; then
  cat > "${ROOT}/docker/.env.example" <<'EOF'
# docker compose overrides only (copy to docker/.env — gitignored)
POSTGRES_USER=aura
POSTGRES_PASSWORD=aura
POSTGRES_DB=aura
POSTGRES_PORT=5432
OLLAMA_PORT=11434
API_PORT=3000
# API_DOCKER_TARGET=dev
EOF
  echo "created docker/.env.example"
fi

echo "Wrote ${DST}"
ls -la "${DST}" "${ROOT}/docker/.env.example"
