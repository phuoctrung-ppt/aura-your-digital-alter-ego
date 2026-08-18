# Aura local dev helpers
COMPOSE := docker compose -f docker/docker-compose.yml

.PHONY: up up-api down ps logs restart pull-model env-example help

## Start Postgres + Ollama in the background (API on host via pnpm)
up:
	$(COMPOSE) up -d

## Start Postgres + Ollama + API container (build apps/api/Dockerfile)
## Override target: API_DOCKER_TARGET=runner make up-api
up-api:
	$(COMPOSE) --profile with-api up -d --build

## Stop containers (volumes kept)
down:
	$(COMPOSE) --profile with-api down

## Show container status
ps:
	$(COMPOSE) --profile with-api ps

## Follow logs (all services, including api if profile active)
logs:
	$(COMPOSE) --profile with-api logs -f

## Restart infra (postgres + ollama only)
restart: down up

## Pull an Ollama chat model (override with MODEL=...)
## Example: make pull-model MODEL=llama3.2
MODEL ?= llama3.2
pull-model:
	$(COMPOSE) exec ollama ollama pull $(MODEL)

## Materialize root .env.example from docs/env.example.txt (AGENTS §13 names)
env-example:
	bash scripts/write-env-example.sh

help:
	@echo "Targets: up | up-api | down | ps | logs | restart | pull-model | env-example"
