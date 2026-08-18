# Aura Docker stack (local dev)

**Default:** Postgres 16 + Ollama. Nest API runs on the host with `pnpm` (fastest DX).

**Optional:** API container via compose profile `with-api` (`make up-api`) using `apps/api/Dockerfile`.

Whisper / TTS sidecars are **not** in compose yet — use host-configured `WHISPER_BASE_URL` / `TTS_*` when M5 lands (see AGENTS.md §13).

## Prerequisites

- Docker Engine + Docker Compose v2+
- Ports free by default: `5432` (Postgres), `11434` (Ollama), and `3000` if using `with-api`
- For host API: Node ≥ 20, pnpm 11 (`corepack enable`)

### Port conflicts

If another stack already binds those ports, override host ports (container ports stay the same):

```bash
# example: host 5433 / 11435 / 3001
export POSTGRES_PORT=5433
export OLLAMA_PORT=11435
export API_PORT=3001
make up
# then DATABASE_URL=postgresql://aura:aura@localhost:5433/aura
#      OLLAMA_BASE_URL=http://localhost:11435
```

Or put `POSTGRES_PORT` / `OLLAMA_PORT` / `API_PORT` in `docker/.env` (gitignored when named `.env`).

## One-command paths

### A) Infra only + host API (recommended day-to-day)

```bash
# From repo root
make up                 # or: ./scripts/dev-up.sh
pnpm install
pnpm build:contracts
# apps/api/.env — see root .env.example / docs/env.example.txt for names
pnpm dev:api            # → GET http://localhost:3000/health
```

### B) Full stack in Docker (Postgres + Ollama + API)

```bash
make up-api
# → API health: http://localhost:3000/health
# Dev target mounts apps/api/src (hot reload). Production-ish image:
#   API_DOCKER_TARGET=runner make up-api
```

Stop:

```bash
make down
# wipe volumes (Postgres data + Ollama models + audio volume):
docker compose -f docker/docker-compose.yml --profile with-api down -v
```

## Services & ports

| Service    | Image / build              | Host port | Role                                      | Always? |
|------------|----------------------------|-----------|-------------------------------------------|---------|
| `postgres` | `postgres:16-alpine`       | `5432`    | Primary DB                                | yes     |
| `ollama`   | `ollama/ollama:latest`     | `11434`   | Local chat LLM                            | yes     |
| `api`      | `apps/api/Dockerfile`      | `3000`    | Nest API (`profile: with-api`)            | optional|

Network: `aura` (bridge). Host-published ports exist so tools and the **host-run API** can reach Postgres/Ollama. Do not expose Postgres publicly outside local dev.

Named volumes:

- `aura_postgres_data` — Postgres data
- `aura_ollama_data` — pulled models / Ollama state
- `aura_audio_data` — turn audio when API runs in compose (`AUDIO_STORAGE_PATH`)

## Env names (AGENTS.md §13)

Root template (empty values — no secrets):

```bash
make env-example          # writes ./.env.example from docs/env.example.txt
# or: cp docs/env.example.txt .env.example
```

| Name | Used by | Notes |
|------|---------|--------|
| `DATABASE_URL` | API | Host: `postgresql://aura:aura@localhost:5432/aura`; in-compose: host `postgres` |
| `JWT_ACCESS_SECRET` | API | Required when auth lands (M2); compose sets dev-only default |
| `JWT_REFRESH_SECRET` | API | Same |
| `PORT` | API | Default `3000` |
| `OLLAMA_BASE_URL` | API | Host: `http://localhost:11434`; in-compose: `http://ollama:11434` |
| `OLLAMA_CHAT_MODEL` | API | After `make pull-model` |
| `LLM_FALLBACK_*` | API | Optional cloud chat |
| `STT_PROVIDER` / `WHISPER_BASE_URL` | API | Whisper not in compose — point at host or future sidecar |
| `TTS_*` | API | Pluggable TTS |
| `AUDIO_STORAGE_PATH` | API | Local filesystem for turn blobs |
| `EXPO_PUBLIC_API_URL` | Mobile | e.g. `http://localhost:3000` (device may need LAN IP) |

Compose-only overrides (optional `docker/.env`):

```bash
POSTGRES_USER=aura
POSTGRES_PASSWORD=aura
POSTGRES_DB=aura
POSTGRES_PORT=5432
OLLAMA_PORT=11434
API_PORT=3000
API_DOCKER_TARGET=dev    # or runner
```

## DATABASE_URL (host-run API)

```bash
DATABASE_URL=postgresql://aura:aura@localhost:5432/aura
```

Verify Postgres:

```bash
docker compose -f docker/docker-compose.yml exec postgres pg_isready -U aura -d aura
```

## OLLAMA_BASE_URL

```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2
```

### Pull a chat model (manual)

Model download is **not** automated in compose (can be large / slow):

```bash
make pull-model MODEL=llama3.2
# or: docker compose -f docker/docker-compose.yml exec ollama ollama pull llama3.2
```

Other common tags: `llama3.2:1b`, `qwen2.5:3b`, `phi3:mini`.

## Whisper / STT notes (MVP path)

- Compose does **not** ship a Whisper container in M11.
- When M5 lands, set `STT_PROVIDER=whisper-local` (or `whisper-api`) and `WHISPER_BASE_URL` to a host process or external URL.
- Optional later: add a `whisper` service on the `aura` network and point `WHISPER_BASE_URL=http://whisper:9000`.

## API Dockerfile

Built from **repo root** (pnpm workspace):

```bash
docker build -f apps/api/Dockerfile -t aura-api --target runner .
# health: container listens on PORT (default 3000) → GET /health
```

Stages: `deps` → `builder` → `runner` (default CMD) | `dev` (nest watch).

## CI

GitHub Actions: `.github/workflows/ci.yml` — pnpm install, contracts build/typecheck, API typecheck + lint/test stubs, mobile typecheck. No Docker required for the default CI job.

## EAS (mobile)

Stub profiles: `apps/mobile/eas.json` (`development`, `preview`, `production`). Wire real Expo project IDs / secrets when EAS is configured; builds may be dry-run until credentials exist.

## Tear down

```bash
make down
docker compose -f docker/docker-compose.yml --profile with-api down -v
```

## Notes

- Image tags: Postgres major `16`; Ollama `latest` (pin a digest later if needed).
- Secrets: only local defaults or private env files — never commit production credentials.
- Queue/Redis: layer off — not in this compose file.
