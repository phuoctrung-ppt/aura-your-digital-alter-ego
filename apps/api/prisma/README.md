# Aura Prisma (`apps/api/prisma`)

PostgreSQL 16 via Prisma. Same schema for **local compose Postgres** and **Supabase** — switch only with `DATABASE_URL`.

No exotic extensions required for MVP (`provider = "postgresql"`, `@default(uuid())`). Compatible with Supabase plain Postgres (direct or pooler URI).

## Local (Docker Compose)

1. Start Postgres:

   ```bash
   make up
   # or: docker compose -f docker/docker-compose.yml up -d postgres
   ```

2. Set `DATABASE_URL` for the **host-run** API (repo root `.env` or `apps/api/.env`):

   ```bash
   DATABASE_URL=postgresql://aura:aura@localhost:5432/aura
   ```

3. Generate client + apply migrations + seed:

   ```bash
   export DATABASE_URL=postgresql://aura:aura@localhost:5432/aura
   pnpm --filter @aura/api prisma:generate
   pnpm --filter @aura/api prisma:migrate:dev
   pnpm --filter @aura/api prisma:seed
   ```

### Port collision (`POSTGRES_PORT`)

Compose maps `${POSTGRES_PORT:-5432}:5432`. If host `5432` is taken (common on this machine):

```bash
export POSTGRES_PORT=5433
make up
# then:
export DATABASE_URL=postgresql://aura:aura@localhost:5433/aura
```

Do **not** hard-code a single host port in `schema.prisma`.

Inside the compose network (profile `with-api`), the URL uses hostname `postgres` and container port `5432` — see `docker/docker-compose.yml`.

## Production (Supabase) — first-time setup

Same Prisma schema as local. No Supabase SDK and no non-default extensions for MVP (`provider = "postgresql"`).

### A) Create project + connection string

1. Create a project at [supabase.com](https://supabase.com) (region closest to users; VN/SEA → Singapore if available).
2. Open **Project Settings → Database**.
3. Copy a Postgres URI:
   - **Direct (recommended for `migrate deploy`):** host like `db.<project-ref>.supabase.co`, port `5432`.
   - **Pooler (runtime app connections):** often port `6543` / Session or Transaction mode under *Connection pooling*.

   Prisma Migrate needs a connection that supports DDL. Prefer the **direct** URI (or pooler **Session** mode) for migrations. Use the pooler URI for the long-running Nest API if you want pooled connections.

4. URI shape (values never committed):

   ```bash
   # Direct (migrations)
   DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
   # or classic:
   # DATABASE_URL=postgresql://postgres:<PASSWORD>@db.<ref>.supabase.co:5432/postgres
   ```

   URL-encode special characters in the password.

### B) Apply migrations (one-shot from a trusted machine / CI)

From the monorepo root, with the **direct** URI exported (do not write it into gitignored docs only — use shell env or a secret manager):

```bash
export DATABASE_URL='postgresql://…'   # Supabase direct URI
pnpm --filter @aura/api prisma:generate
pnpm --filter @aura/api prisma:migrate  # prisma migrate deploy
```

Expected: migration `20260818071238_init` applied; tables `users`, `personas`, `sessions`, `turns`, `memory_items`, `safety_events`, `refresh_tokens` (+ `_prisma_migrations`).

Verify in Supabase **SQL Editor**:

```sql
select tablename from pg_tables where schemaname = 'public' order by 1;
select migration_name, finished_at from "_prisma_migrations";
```

### C) Seed MVP personas (once per environment)

```bash
export DATABASE_URL='postgresql://…'   # same or pooler session URI
pnpm --filter @aura/api prisma:seed
```

Seeds only `tough-interviewer` + `native-buddy` (upsert by slug). Safe to re-run.

### D) Point the API at Supabase

Set runtime secrets (hosting / compose prod / secret store) — **never commit**:

| Var | Value |
|-----|--------|
| `DATABASE_URL` | Pooler or direct URI for Nest |
| `JWT_*` / AI keys | unchanged from AGENTS §13 |

Restart API; health should pass and Prisma `$connect` succeeds.

### E) Ongoing deploys

- Local / feature work: `prisma:migrate:dev` against compose Postgres only.
- Production: CI or release job runs **`prisma migrate deploy`** (`prisma:migrate`) against Supabase **before** or as part of API rollout.
- Never run `prisma:migrate:reset` against Supabase (wipes data).

### F) Troubleshooting

| Symptom | Fix |
|---------|-----|
| `P1001` can't reach DB | Allow your IP in Supabase Network Restrictions; check password / URL-encoding |
| Migrate hangs / prepared statement errors on pooler | Use **direct** URI or pooler **Session** mode for migrate |
| SSL required | Append `?sslmode=require` if the URI does not already enable TLS |
| Shadow DB / `migrate dev` on Supabase | Don't — use `migrate deploy` only on hosted DB |

## Rollback / down

Prisma Migrate does not emit separate SQL `down` files. Local rollback options:

| Goal | Command |
|------|---------|
| Wipe DB + re-apply all migrations + seed | `pnpm --filter @aura/api prisma:migrate:reset` (`prisma migrate reset`) |
| Production rollback | Prefer a new forward migration; avoid `migrate reset` against shared DBs |

## Scripts (`@aura/api`)

| Script | Purpose |
|--------|---------|
| `prisma:generate` | Generate Prisma Client |
| `prisma:migrate:dev` | Create/apply migrations (local) |
| `prisma:migrate` | `prisma migrate deploy` (CI / prod) |
| `prisma:migrate:reset` | Reset DB + re-seed (local only) |
| `prisma:seed` | Run `prisma/seed.ts` (`node --import tsx`) |
| `prisma:studio` | Prisma Studio |

## Entities

| Model | Table | Notes |
|-------|-------|-------|
| `User` | `users` | email unique, locale default `vi`, prefs JSON |
| `Persona` | `personas` | global catalog; seed slugs only `tough-interviewer`, `native-buddy` |
| `Session` | `sessions` | user Cascade / persona Restrict; status `open\|ended` |
| `Turn` | `turns` | role `user\|assistant`; `@@unique([sessionId, clientTurnId])` |
| `MemoryItem` | `memory_items` | user Cascade; persona/sourceTurn SetNull |
| `SafetyEvent` | `safety_events` | no transcript PII column |
| `RefreshToken` | `refresh_tokens` | `tokenHash` unique; rotation via `replacedById` |

No `tenant_id` (multi-tenancy off).
