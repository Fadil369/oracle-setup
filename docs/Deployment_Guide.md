# Deployment Guide

## Prerequisites

- Node.js 20+
- Docker Engine / Docker Desktop
- Cloudflare Wrangler (for edge worker deployment)
- GitHub repository secrets configured

## Local Validation

```bash
npm ci
npm run lint
npm test
npm run audit:deps
```

## Production Docker Stack

1. Create runtime env file:

```bash
cp .env.production.example .env.production
# set API_KEY, Grafana credentials, runtime values
```

1. Start platform:

```bash
docker compose -f docker-compose.production.yml up -d
```

1. Validate health:

```bash
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs --tail=50
```

## CI/CD Pipeline

Workflows added:

- `.github/workflows/ci.yml`: lint, tests, dependency audit, Trivy scan.
- `.github/workflows/release.yml`: release-please semantic version PR/tag flow.

## Branch Protection Rules (Recommended)

Configure on GitHub main branch:

- Require pull request before merge.
- Require status checks: `quality` job from CI workflow.
- Require conversation resolution.
- Prevent force-push and deletion.

## Release and Deployment Strategy

1. Merge to `main` after CI passes.
2. Release Please creates/updates release PR with semantic version bump.
3. On release tag, run deployment workflow (add environment-specific workflow if needed).
4. Roll back by re-deploying previous release tag.
