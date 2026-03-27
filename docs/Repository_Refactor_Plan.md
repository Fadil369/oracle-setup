# Improved Repository Structure

## Current State

Repository includes runtime worker code, operational scripts, large claim data artifacts, and deployment docs in a mostly flat root.

## Target Structure

```text
.
├── apps/
│   ├── scanner-worker/
│   └── portals-worker/
├── packages/
│   ├── fhir/
│   └── shared/
├── scripts/
│   ├── batch/
│   └── deploy/
├── data/
│   ├── samples/
│   └── generated/
├── infra/
│   ├── edge/
│   ├── observability/
│   └── docker/
├── docs/
├── tests/
└── .github/workflows/
```

## Refactor Actions

1. Move scanner worker runtime from `src/` to `apps/scanner-worker/src/`.
2. Move portals worker runtime from `infra-v3/portals-worker/src/` to `apps/portals-worker/src/`.
3. Move root-level batch scripts (`*.mjs`, `*.ps1`, `*.sh`) into `scripts/` by domain.
4. Move claim data files (`*.csv`, `*.json`) into `data/` and protect with access policy.
5. Keep `packages/fhir` as reusable package boundary and add shared typed contracts.
6. Add per-app README and explicit API contracts.

## Naming and Modularity

- Use `apps/*` for deployable services.
- Use `packages/*` for reusable libraries.
- Use `infra/*` for environment and platform assets.
- Keep one deployment manifest per environment (`docker-compose.production.yml`, `docker-compose.staging.yml`).
