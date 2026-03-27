# Developer Onboarding Guide

## Repository Layout

- `src/`: scanner worker runtime
- `infra-v3/portals-worker/`: control tower worker runtime
- `fhir-integration/`, `packages/fhir/`, `sbs-integration/`: healthcare coding and FHIR bridges
- `tests/`: end-to-end and interface validation scripts
- `infra/`: production edge and observability configs
- `docs/`: architecture, security, infra, and deployment guides

## Setup

```bash
npm ci
npm run lint
npm test
```

## Secrets

Do not commit secrets.

Use:

- Cloudflare secrets for worker runtime (`wrangler secret put ...`)
- `.env.production` for container runtime

## Development Workflow

1. Create feature branch.
2. Add tests with code changes.
3. Run lint and tests locally.
4. Open PR and address CI findings.
5. Merge after approvals and passing checks.

## Coding Standards

- Prefer explicit auth checks for all non-public APIs.
- Avoid hardcoded credentials and host-private metadata in public responses.
- Emit structured logs and metrics for new endpoints.
- Keep payload contracts backward compatible when possible.

## Operational Checklist

- Verify API auth on protected endpoints.
- Verify observability telemetry is available in Grafana.
- Verify scanner batch paths under load test before production rollout.
