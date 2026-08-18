# Aura

VN-first voice mobile AI companion (Expo + NestJS monorepo).

> Product / architecture: see `docs/aura-story.md`, `docs/architecture.md`, and `AGENTS.md`.

## Package manager

**pnpm** (v11+) is required. Node ≥ **22.13** (pnpm 11 needs `node:sqlite`; CI + API image use Node 22).

```bash
corepack enable   # optional
pnpm -v           # expect 11.x
```

Workspace layout (`pnpm-workspace.yaml`):

- `apps/api` — NestJS API (`@aura/api`)
- `apps/mobile` — Expo React Native client (`@aura/mobile`)
- `packages/contracts` — shared Zod schemas / types (`@aura/contracts`)
- `packages/config` — shared TS/ESLint fragments (`@aura/config`)

Root `.npmrc` sets `shamefully-hoist=true` so Expo/RN packages resolve peers correctly in the monorepo.

## Bootstrap (local dev)

```bash
# From repo root
pnpm install

# Shared contracts
pnpm build:contracts

# API — health on :3000
pnpm dev:api
# → GET http://localhost:3000/health
# → { "data": { "ok": true, "service": "aura-api" }, "error": null }

# Mobile — Expo dev server
pnpm dev:mobile
# or: pnpm --filter @aura/mobile start
```

### Environment (AGENTS.md §13 names only)

```bash
make env-example                 # writes root .env.example
# or: cp docs/env.example.txt .env.example

# apps/api/.env  (do not commit real secrets)
PORT=3000
DATABASE_URL=postgresql://aura:aura@localhost:5432/aura
OLLAMA_BASE_URL=http://localhost:11434
# OLLAMA_CHAT_MODEL=llama3.2   # after: make pull-model
# JWT_ACCESS_SECRET=…          # required when auth (M2) lands
# JWT_REFRESH_SECRET=…
```

See [`docs/env.example.txt`](docs/env.example.txt) for the full name list and [`docker/README.md`](docker/README.md) for the local stack.

Mobile public config:

```bash
# apps/mobile/.env  or Expo env
EXPO_PUBLIC_API_URL=http://localhost:3000
```

## Docker

Local deps (Postgres 16 + Ollama). Optional API container via profile `with-api`. Details: [`docker/README.md`](docker/README.md).

```bash
make up              # Postgres + Ollama
make up-api          # + Nest API container (apps/api/Dockerfile)
make ps
make logs
make down

# optional chat model (manual; can be large)
make pull-model MODEL=llama3.2

# helper
./scripts/dev-up.sh
./scripts/dev-up.sh --with-api
```

Host-run API connection string:

```text
DATABASE_URL=postgresql://aura:aura@localhost:5432/aura
OLLAMA_BASE_URL=http://localhost:11434
```

## CI & mobile builds

- **GitHub Actions:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — install, contracts build/typecheck, API typecheck + lint/test stubs, mobile typecheck.
- **EAS:** [`apps/mobile/eas.json`](apps/mobile/eas.json) — `development` / `preview` / `production` profiles (credentials optional until first real build).

## Scripts (root)

| Script | Purpose |
|--------|---------|
| `pnpm dev:api` | NestJS watch mode |
| `pnpm dev:mobile` | Expo start |
| `pnpm build:contracts` | Compile `@aura/contracts` |
| `pnpm typecheck` | Typecheck all packages that define it |
| `pnpm lint` | Lint all packages that define it |
| `pnpm test` | Tests (API placeholder until qa-worker) |
| `make env-example` | Materialize root `.env.example` |

## MVP scope note

Scaffold + contracts + design + **DevOps (M11)** are in place. Auth, Prisma schema, AI orchestration, and full mobile navigation land in later modules. See plan `docs/plans/2026-08-17-aura-mobile-mvp.md`.

