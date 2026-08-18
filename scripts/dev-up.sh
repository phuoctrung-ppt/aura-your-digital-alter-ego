#!/usr/bin/env bash
# Start local Docker deps (Postgres + Ollama). API still runs via pnpm on the host by default.
# Pass --with-api to also start the API container (compose profile with-api).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/docker/docker-compose.yml"
WITH_API=0

for arg in "$@"; do
  case "$arg" in
    --with-api) WITH_API=1 ;;
    -h|--help)
      echo "Usage: $0 [--with-api]"
      exit 0
      ;;
  esac
done

echo "==> Starting Aura docker stack (${COMPOSE_FILE})"
if [[ "${WITH_API}" -eq 1 ]]; then
  docker compose -f "${COMPOSE_FILE}" --profile with-api up -d --build
else
  docker compose -f "${COMPOSE_FILE}" up -d
fi

echo "==> Waiting for Postgres healthy..."
for i in $(seq 1 30); do
  if docker compose -f "${COMPOSE_FILE}" exec -T postgres pg_isready -U aura -d aura >/dev/null 2>&1; then
    echo "==> Postgres is ready"
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "!! Postgres did not become ready in time" >&2
    docker compose -f "${COMPOSE_FILE}" ps
    exit 1
  fi
  sleep 1
done

if [[ "${WITH_API}" -eq 1 ]]; then
  echo "==> Waiting for API /health..."
  for i in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:${API_PORT:-3000}/health" >/dev/null 2>&1; then
      echo "==> API is ready"
      break
    fi
    if [[ "$i" -eq 40 ]]; then
      echo "!! API did not become ready in time (check: docker compose -f docker/docker-compose.yml --profile with-api logs api)" >&2
      docker compose -f "${COMPOSE_FILE}" --profile with-api ps
      exit 1
    fi
    sleep 2
  done
fi

docker compose -f "${COMPOSE_FILE}" --profile with-api ps

if [[ "${WITH_API}" -eq 1 ]]; then
  cat <<'EOF'

Stack is up (Postgres + Ollama + API container).

  GET http://localhost:3000/health
  DATABASE_URL (in-container) uses host `postgres`
  OLLAMA_BASE_URL (in-container) http://ollama:11434

Pull a model (optional):
  make pull-model MODEL=llama3.2

EOF
else
  cat <<'EOF'

Stack is up (Postgres + Ollama).

  DATABASE_URL=postgresql://aura:aura@localhost:5432/aura
  OLLAMA_BASE_URL=http://localhost:11434

Pull a model (optional, may take a while):
  make pull-model MODEL=llama3.2

Run API on host:
  pnpm dev:api

Or full stack in Docker:
  ./scripts/dev-up.sh --with-api
  # or: make up-api

Env template (AGENTS §13 names):
  make env-example

EOF
fi
