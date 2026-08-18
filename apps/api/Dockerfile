# Aura API — multi-stage (pnpm monorepo)
# Build from **repo root**:
#   docker build -f apps/api/Dockerfile -t aura-api .
#   # production (default final stage):
#   docker build -f apps/api/Dockerfile --target runner -t aura-api .
# Compose: docker/docker-compose.yml service `api` (profile: with-api, target=dev)
#
# Stages:
#   deps    — install workspace deps (cached on lockfile)
#   builder — compile @aura/contracts + @aura/api, then pnpm deploy
#   dev     — watch mode (local compose; --target=dev)
#   runner  — production Node (default final stage for Cloud Run / CI)
#
# pnpm@11.9.0 (root packageManager) requires Node >= 22.13 (node:sqlite).
# Node 20 + pnpm 11 fails with ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite.

ARG NODE_VERSION=22.13.1-alpine
ARG PNPM_VERSION=11.9.0

# ── base: pnpm via npm -g (matches packageManager; Alpine-safe) ─────────────
FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

# ── deps ─────────────────────────────────────────────────────────────────────
FROM base AS deps
# Full workspace manifests so pnpm lockfile resolution matches host install.
# Mobile sources are omitted later; package.json alone satisfies the workspace.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/config/package.json ./packages/config/
COPY apps/api/package.json ./apps/api/
COPY apps/mobile/package.json ./apps/mobile/
# Prefer offline-ish frozen install of API dependency graph only
RUN pnpm install --frozen-lockfile --filter @aura/api... --filter @aura/contracts... \
  || pnpm install --frozen-lockfile

# ── builder ──────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app /app
COPY tsconfig.base.json ./
COPY packages/contracts ./packages/contracts
COPY packages/config ./packages/config
COPY apps/api ./apps/api
RUN pnpm --filter @aura/contracts build \
  && pnpm --filter @aura/api build

# pnpm v10+ deploy requires injected workspace packages OR --legacy.
# Use --legacy so @aura/contracts is copied into the deploy tree without
# changing monorepo install semantics for Expo (shamefully-hoist).
# Output layout is flat: /app/isolated/{dist,node_modules,package.json}
RUN pnpm --filter @aura/api --prod deploy --legacy /app/isolated

# ── dev (compose watch / hot reload; build with --target=dev) ────────────────
FROM base AS dev
ENV NODE_ENV=development
ENV PORT=3000
COPY --from=deps /app /app
COPY tsconfig.base.json ./
COPY packages/contracts ./packages/contracts
COPY packages/config ./packages/config
COPY apps/api ./apps/api
# Build contracts once so @aura/contracts resolves at start; nest --watch reloads API
RUN pnpm --filter @aura/contracts build
EXPOSE 3000
WORKDIR /app
CMD ["pnpm", "--filter", "@aura/api", "start:dev"]

# ── runner (production — default final stage) ────────────────────────────────
FROM node:${NODE_VERSION} AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nestjs

# Deployed package only — flat tree, no monorepo apps/api nesting
COPY --from=builder --chown=nestjs:nodejs /app/isolated ./

USER nestjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Flat deploy tree: entrypoint is dist/main.js next to node_modules/
CMD ["node", "dist/main.js"]
